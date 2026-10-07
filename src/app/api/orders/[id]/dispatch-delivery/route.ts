import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { callAutoPickCommand, clearAutoPickOrderMainSystemSelfDelivery, refreshAutoPickOrderFromPlugin, resolveAutoPickCommandPlatform } from "@/lib/autoPickOrders";
import { cancelAutoCompleteJob } from "@/lib/autoPickAutoComplete";
import { hasActiveShansongDelivery, placeShansongOrder } from "@/lib/shansong";
import { Prisma } from "../../../../../../prisma/generated-client";
import {
  isAutoPickOrderCancelledStatus,
  isAutoPickOrderCompletedStatus,
  isAutoPickOrderDeliveringStatus,
  isAutoPickOrderRiderAssigned,
  isAutoPickOrderSelfDeliveryActive,
  isAutoPickPickupOrder,
} from "@/lib/autoPickOrderStatus";

export const dynamic = "force-dynamic";

type DeliverySelection = {
  provider: "maiyitian" | "shansong";
  logisticId: string;
  logisticTag: string;
  servicePkg: string;
};

function parseDeliverySelections(body: Record<string, unknown>): DeliverySelection[] {
  const rawSelections = Array.isArray(body.selections) && body.selections.length > 0
    ? body.selections
    : [body];
  const seen = new Set<string>();
  const selections: DeliverySelection[] = [];
  for (const rawSelection of rawSelections) {
    if (!rawSelection || typeof rawSelection !== "object" || Array.isArray(rawSelection)) continue;
    const selection = rawSelection as Record<string, unknown>;
    const provider = selection.provider === "shansong" ? "shansong" : "maiyitian";
    const logisticId = String(selection.logisticId || "").trim();
    const logisticTag = String(selection.logisticTag || "").trim();
    const servicePkg = String(selection.servicePkg || "").trim();
    if (!logisticId || !logisticTag) continue;
    const key = `${provider}:${logisticId}:${logisticTag}:${servicePkg}`;
    if (seen.has(key)) continue;
    seen.add(key);
    selections.push({ provider, logisticId, logisticTag, servicePkg });
    if (selections.length >= 20) break;
  }
  return selections;
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) return NextResponse.json({ error: "Permission denied" }, { status: 403 });

  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const selections = parseDeliverySelections(body);
    if (selections.length === 0) {
      return NextResponse.json({ error: "请选择配送服务" }, { status: 400 });
    }
    if (selections.some((selection) => selection.provider === "shansong") && selections.length > 1) {
      return NextResponse.json({
        error: "闪送个人账号必须单独发单，不能与麦芽田聚合运力同时呼叫，否则外卖平台配送状态会冲突",
      }, { status: 400 });
    }

    const isAdmin = Boolean(
      session.role === "SUPER_ADMIN"
      || (session.role && String(session.role).includes("管理"))
      || (Array.isArray(session.permissions) && (session.permissions.includes("*") || session.permissions.includes("members:manage") || session.permissions.includes("admin")))
    );
    const order = await prisma.autoPickOrder.findFirst({
      where: { id, ...(isAdmin ? {} : { userId: session.id }) },
      include: { items: { orderBy: { createdAt: "asc" } } },
    });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (isAutoPickOrderCompletedStatus(order.status) || isAutoPickOrderCancelledStatus(order.status)) {
      return NextResponse.json({ error: "订单已结束，不能呼叫配送" }, { status: 409 });
    }
    if (isAutoPickPickupOrder(order.rawPayload, order.userAddress, order.shopAddress)) {
      return NextResponse.json({ error: "到店自取订单不需要呼叫配送" }, { status: 409 });
    }
    if (isAutoPickOrderSelfDeliveryActive(order) || isAutoPickOrderDeliveringStatus(order.status) || isAutoPickOrderRiderAssigned(order)) {
      return NextResponse.json({ error: "订单已有配送任务，不能重复呼叫" }, { status: 409 });
    }
    if (hasActiveShansongDelivery(order.rawPayload)) {
      return NextResponse.json({ error: "该订单已有闪送任务，不能重复发单" }, { status: 409 });
    }

    const sourceId = String(order.sourceId || "").trim();
    if (!sourceId) {
      return NextResponse.json({ error: "订单缺少麦芽田订单标识，请先同步订单" }, { status: 409 });
    }
    // 多选抢单需要同时发起，避免第一条请求改变订单状态后影响后续运力发单。
    const dispatchResults = await Promise.all(selections.map(async (selection) => {
      if (selection.provider === "shansong") {
        let placed: Record<string, unknown>;
        try {
          placed = await placeShansongOrder(order, selection.logisticId) as Record<string, unknown>;
        } catch (error) {
          return {
            selection,
            ok: false,
            status: 502,
            data: { error: error instanceof Error ? error.message : "闪送发单失败" },
          };
        }
        try {
          // 闪送运力由本系统直接购买；这里调用麦芽田“商家自配”只负责把履约状态
          // 继续回传给美团/京东等订单来源平台，不调用麦芽田聚合配送。
          const platformSync = await callAutoPickCommand(order.userId, "/self-delivery", {
            platform: resolveAutoPickCommandPlatform(order),
            dailyPlatformSequence: order.dailyPlatformSequence,
            orderNo: order.orderNo,
            sourceId,
          });
          if (!platformSync.ok) {
            const syncError = String(platformSync.data?.error || platformSync.data?.message || platformSync.data?.text || "麦芽田状态回传失败");
            return {
              selection,
              ok: false,
              status: 502,
              data: {
                ...placed,
                shansongPlaced: true,
                platformSyncOk: false,
                platformSyncError: syncError,
                error: `闪送已下单，但外卖平台配送状态回传失败：${syncError}`,
              },
            };
          }
          return {
            selection,
            ok: true,
            status: 200,
            data: { ...placed, shansongPlaced: true, platformSyncOk: true },
          };
        } catch (error) {
          return {
            selection,
            ok: false,
            status: 502,
            data: {
              ...placed,
              shansongPlaced: true,
              platformSyncOk: false,
              platformSyncError: error instanceof Error ? error.message : "麦芽田状态回传失败",
              error: `闪送已下单，但外卖平台配送状态回传失败：${error instanceof Error ? error.message : "麦芽田状态回传失败"}`,
            },
          };
        }
      }
      const result = await callAutoPickCommand(order.userId, "/dispatch-delivery", {
        platform: resolveAutoPickCommandPlatform(order),
        dailyPlatformSequence: order.dailyPlatformSequence,
        orderNo: order.orderNo,
        sourceId,
        ...selection,
      });
      return { selection, ...result };
    }));
    const successfulResults = dispatchResults.filter((result) => result.ok);
    const placedShansong = dispatchResults.find((result) => result.selection.provider === "shansong" && result.data?.shansongPlaced === true);
    if (successfulResults.length === 0 && !placedShansong) {
      const firstFailure = dispatchResults[0];
      const failureData = (firstFailure?.data && typeof firstFailure.data === "object") ? firstFailure.data as Record<string, unknown> : {};
      const failureError = failureData.error || failureData.message || (failureData.parsed as Record<string, unknown> | undefined)?.message || failureData.text || "呼叫配送失败";
      return NextResponse.json({
        ...failureData,
        error: String(failureError),
      }, { status: firstFailure?.status || 409 });
    }

    await clearAutoPickOrderMainSystemSelfDelivery(order.userId, order.id, "third-party-delivery-dispatched");
    await cancelAutoCompleteJob(order.id, "third-party-delivery-dispatched");
    const hasMaiyitianSuccess = successfulResults.some((result) => result.selection.provider === "maiyitian");
    const platformSyncSucceeded = placedShansong?.data?.platformSyncOk === true;
    const refreshed = hasMaiyitianSuccess || platformSyncSucceeded
      ? await refreshAutoPickOrderFromPlugin(order.userId, {
          id: sourceId,
          platform: order.platform,
          orderNo: order.orderNo,
          orderTime: order.orderTime,
        }).catch((error) => {
          console.error("Failed to refresh order after dispatch:", error);
          return null;
        })
      : null;

    if (placedShansong) {
      const current = await prisma.autoPickOrder.findUnique({ where: { id: order.id } });
      const currentDelivery = current?.delivery && typeof current.delivery === "object" && !Array.isArray(current.delivery)
        ? current.delivery as Record<string, unknown>
        : {};
      const rawPayload = current?.rawPayload && typeof current.rawPayload === "object" && !Array.isArray(current.rawPayload)
        ? current.rawPayload as Record<string, unknown>
        : {};
      const systemMeta = rawPayload.systemMeta && typeof rawPayload.systemMeta === "object" && !Array.isArray(rawPayload.systemMeta)
        ? rawPayload.systemMeta as Record<string, unknown>
        : {};
      const shansongData = placedShansong.data;
      const platformSyncOk = shansongData.platformSyncOk === true;
      await prisma.autoPickOrder.update({
        where: { id: order.id },
        data: {
          deliveryId: String(shansongData.orderNumber || placedShansong.selection.logisticId),
          delivery: {
            ...currentDelivery,
            logisticName: "闪送（个人账号）",
            sendFee: Math.max(0, Number(shansongData.totalFeeAfterSave ?? shansongData.totalAmount ?? 0)),
            status: 20,
            track: platformSyncOk ? "闪送派单中 · 外卖平台已开始配送" : "闪送已下单 · 外卖平台状态回传失败",
          } as Prisma.InputJsonValue,
          rawPayload: {
            ...rawPayload,
            systemMeta: {
              ...systemMeta,
              shansongDelivery: {
                issOrderNo: String(shansongData.orderNumber || placedShansong.selection.logisticId),
                status: 20,
                statusDesc: "派单中",
                platformSyncOk,
                platformSyncError: String(shansongData.platformSyncError || "").trim() || null,
                placedAt: new Date().toISOString(),
              },
            },
          } as Prisma.InputJsonValue,
        },
      });
    }

    const finalOrder = (placedShansong ? null : refreshed) || await prisma.autoPickOrder.findUnique({
      where: { id: order.id },
      include: { items: { orderBy: { createdAt: "asc" } } },
    });
    if (placedShansong && placedShansong.data.platformSyncOk !== true) {
      return NextResponse.json({
        ...placedShansong.data,
        order: finalOrder,
        dispatchedCount: 1,
        failedCount: 1,
      }, { status: 502 });
    }
    const primaryResult = successfulResults[0];
    return NextResponse.json({
      ...primaryResult.data,
      order: finalOrder,
      dispatchedCount: successfulResults.length,
      failedCount: dispatchResults.length - successfulResults.length,
      dispatchResults: dispatchResults.map((result) => ({
        ...result.selection,
        ok: result.ok,
        status: result.status,
        error: result.ok ? null : String(result.data?.error || result.data?.message || result.data?.text || "呼叫失败"),
      })),
    }, { status: primaryResult.status });
  } catch (error) {
    console.error("Failed to dispatch delivery:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "呼叫配送失败" }, { status: 500 });
  }
}
