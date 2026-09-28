import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { callAutoPickCommand, resolveAutoPickCommandPlatform } from "@/lib/autoPickOrders";
import { isAutoPickOrderCompletedStatus } from "@/lib/autoPickOrderStatus";
import { Prisma } from "../../../../../../prisma/generated-client";

export const dynamic = "force-dynamic";

function callbackResponse() {
  return NextResponse.json({ status: 200, msg: "", data: null });
}

export async function POST(request: NextRequest) {
  const expectedSecret = String(process.env.SHANSONG_NOTIFY_SECRET || "").trim();
  if (expectedSecret && request.nextUrl.searchParams.get("token") !== expectedSecret) {
    return NextResponse.json({ status: 403, msg: "Forbidden", data: null }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (String(body.callbackEvent || "") !== "ORDER_STATUS_CALLBACK") return callbackResponse();
    const internalOrderId = String(body.orderNo || "").trim();
    if (!internalOrderId) return callbackResponse();
    const order = await prisma.autoPickOrder.findUnique({ where: { id: internalOrderId } });
    if (!order) return callbackResponse();

    const currentDelivery = order.delivery && typeof order.delivery === "object" && !Array.isArray(order.delivery)
      ? order.delivery as Record<string, unknown>
      : {};
    const rawPayload = order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)
      ? order.rawPayload as Record<string, unknown>
      : {};
    const systemMeta = rawPayload.systemMeta && typeof rawPayload.systemMeta === "object" && !Array.isArray(rawPayload.systemMeta)
      ? rawPayload.systemMeta as Record<string, unknown>
      : {};
    const courier = body.courier && typeof body.courier === "object" && !Array.isArray(body.courier)
      ? body.courier as Record<string, unknown>
      : {};
    const status = Number(body.status || 0);
    const statusDesc = String(body.statusDesc || "闪送状态更新").trim();
    const subStatusDesc = String(body.subStatusDesc || "").trim();
    const track = [statusDesc, subStatusDesc].filter(Boolean).join(" · ");
    const nextOrderStatus = status === 40 ? "配送中" : status === 50 ? "已完成" : order.status;
    const completedTime = status === 50 ? new Date().toISOString() : currentDelivery.completedTime;
    const currentShansongMeta = systemMeta.shansongDelivery && typeof systemMeta.shansongDelivery === "object" && !Array.isArray(systemMeta.shansongDelivery)
      ? systemMeta.shansongDelivery as Record<string, unknown>
      : {};
    let platformSyncOk = currentShansongMeta.platformSyncOk === true;
    let completionSyncOk = currentShansongMeta.completionSyncOk === true;
    const commandPayload = {
      platform: resolveAutoPickCommandPlatform(order),
      dailyPlatformSequence: order.dailyPlatformSequence,
      orderNo: order.orderNo,
      sourceId: order.sourceId,
    };

    // 我们直接购买闪送运力，但原外卖平台的履约状态仍通过麦芽田订单链路回传。
    // 回调失败时返回非 200，让闪送按官方规则重试，避免出现“闪送送到了、平台没开始/没完成”。
    if ([20, 30, 40, 50].includes(status) && !platformSyncOk) {
      const startSync = await callAutoPickCommand(order.userId, "/self-delivery", commandPayload);
      if (!startSync.ok) {
        throw new Error(String(startSync.data?.error || startSync.data?.message || startSync.data?.text || "外卖平台开始配送状态回传失败"));
      }
      platformSyncOk = true;
    }
    if (status === 50 && isAutoPickOrderCompletedStatus(order.status)) {
      completionSyncOk = true;
    } else if (status === 50 && !completionSyncOk) {
      const completeSync = await callAutoPickCommand(order.userId, "/complete-delivery", commandPayload);
      if (!completeSync.ok) {
        throw new Error(String(completeSync.data?.error || completeSync.data?.message || completeSync.data?.text || "外卖平台配送完成状态回传失败"));
      }
      completionSyncOk = true;
    }

    await prisma.autoPickOrder.update({
      where: { id: order.id },
      data: {
        status: nextOrderStatus,
        deliveryId: String(body.issOrderNo || order.deliveryId || "").trim() || null,
        delivery: {
          ...currentDelivery,
          logisticName: "闪送（个人账号）",
          status,
          subStatus: Number(body.subStatus || 0) || null,
          track,
          riderName: String(courier.name || currentDelivery.riderName || "").trim() || null,
          riderPhone: String(courier.mobile || currentDelivery.riderPhone || "").trim() || null,
          completedTime: completedTime || null,
        } as Prisma.InputJsonValue,
        rawPayload: {
          ...rawPayload,
          systemMeta: {
            ...systemMeta,
            shansongDelivery: {
              ...currentShansongMeta,
              status,
              statusDesc,
              subStatus: Number(body.subStatus || 0) || null,
              platformSyncOk,
              completionSyncOk,
              callback: body,
              updatedAt: new Date().toISOString(),
            },
          },
        } as Prisma.InputJsonValue,
      },
    });
    return callbackResponse();
  } catch (error) {
    console.error("Failed to process Shansong callback:", error);
    return NextResponse.json({ status: 500, msg: "处理失败", data: null }, { status: 500 });
  }
}
