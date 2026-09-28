import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { callAutoPickCommand, clearAutoPickOrderMainSystemSelfDelivery, refreshAutoPickOrderFromPlugin, resolveAutoPickCommandPlatform } from "@/lib/autoPickOrders";
import { cancelAutoCompleteJob } from "@/lib/autoPickAutoComplete";
import {
  isAutoPickOrderCancelledStatus,
  isAutoPickOrderCompletedStatus,
  isAutoPickOrderDeliveringStatus,
  isAutoPickOrderRiderAssigned,
  isAutoPickPickupOrder,
} from "@/lib/autoPickOrderStatus";

export const dynamic = "force-dynamic";

type DeliverySelection = {
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
    const logisticId = String(selection.logisticId || "").trim();
    const logisticTag = String(selection.logisticTag || "").trim();
    const servicePkg = String(selection.servicePkg || "").trim();
    if (!logisticId || !logisticTag) continue;
    const key = `${logisticId}:${logisticTag}:${servicePkg}`;
    if (seen.has(key)) continue;
    seen.add(key);
    selections.push({ logisticId, logisticTag, servicePkg });
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

    const isAdmin = Boolean(
      session.role === "SUPER_ADMIN"
      || (session.role && String(session.role).includes("管理"))
      || (Array.isArray(session.permissions) && (session.permissions.includes("*") || session.permissions.includes("members:manage") || session.permissions.includes("admin")))
    );
    const order = await prisma.autoPickOrder.findFirst({
      where: { id, ...(isAdmin ? {} : { userId: session.id }) },
    });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (isAutoPickOrderCompletedStatus(order.status) || isAutoPickOrderCancelledStatus(order.status)) {
      return NextResponse.json({ error: "订单已结束，不能呼叫配送" }, { status: 409 });
    }
    if (isAutoPickPickupOrder(order.rawPayload, order.userAddress, order.shopAddress)) {
      return NextResponse.json({ error: "到店自取订单不需要呼叫配送" }, { status: 409 });
    }
    if (isAutoPickOrderDeliveringStatus(order.status) || isAutoPickOrderRiderAssigned(order)) {
      return NextResponse.json({ error: "订单已有配送任务，不能重复呼叫" }, { status: 409 });
    }

    const sourceId = String(order.sourceId || "").trim();
    if (!sourceId) return NextResponse.json({ error: "订单缺少麦芽田订单标识，请先同步订单" }, { status: 409 });
    // 多选抢单需要同时发起，避免第一条请求改变订单状态后影响后续运力发单。
    const dispatchResults = await Promise.all(selections.map(async (selection) => {
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
    if (successfulResults.length === 0) {
      const firstFailure = dispatchResults[0];
      return NextResponse.json(firstFailure?.data || { error: "呼叫配送失败" }, { status: firstFailure?.status || 409 });
    }

    await clearAutoPickOrderMainSystemSelfDelivery(order.userId, order.id, "third-party-delivery-dispatched");
    await cancelAutoCompleteJob(order.id, "third-party-delivery-dispatched");
    const refreshed = await refreshAutoPickOrderFromPlugin(order.userId, {
      id: sourceId,
      platform: order.platform,
      orderNo: order.orderNo,
      orderTime: order.orderTime,
    }).catch((error) => {
      console.error("Failed to refresh order after dispatch:", error);
      return null;
    });
    const finalOrder = refreshed || await prisma.autoPickOrder.findUnique({
      where: { id: order.id },
      include: { items: { orderBy: { createdAt: "asc" } } },
    });
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
