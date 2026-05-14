import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { backfillPersistedAutoPickOrderFields, clearAutoPickOrderMainSystemSelfDelivery, normalizeAutoPickOrderPayload, refreshAutoPickOrderFromPlugin, syncAutoOutboundFromCompletedAutoPickOrder, syncBrushOrderFromCompletedAutoPickOrder } from "@/lib/autoPickOrders";
import { cancelAutoCompleteJob } from "@/lib/autoPickAutoComplete";
import { isAutoPickOrderAbnormalStatus, isAutoPickOrderCancelledStatus, isAutoPickOrderCompletedStatus, isAutoPickOrderDeliveringStatus } from "@/lib/autoPickOrderStatus";

export const dynamic = "force-dynamic";

export async function POST(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const order = await prisma.autoPickOrder.findFirst({
      where: {
        id,
        userId: session.id,
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (isAutoPickOrderCancelledStatus(order.status)) {
      return NextResponse.json({
        error: "Order already cancelled",
      }, { status: 409 });
    }

    const refreshedOrder = await refreshAutoPickOrderFromPlugin(session.id, {
      id: order.sourceId,
      platform: order.platform,
      orderNo: order.orderNo,
      orderTime: order.orderTime,
    });

    if (!refreshedOrder) {
      return NextResponse.json({
        ok: false,
        id: order.id,
        orderNo: order.orderNo,
        platform: order.platform,
        preserved: true,
        error: "Order was not found in the current sync query, local record preserved",
      }, { status: 409 });
    }

    if (
      isAutoPickOrderCompletedStatus(refreshedOrder.status)
      || isAutoPickOrderCancelledStatus(refreshedOrder.status)
      || isAutoPickOrderAbnormalStatus(refreshedOrder.status)
    ) {
      await cancelAutoCompleteJob(
        order.id,
        isAutoPickOrderAbnormalStatus(refreshedOrder.status) ? "order-synced-to-abnormal" : "order-synced-to-terminal"
      );
    }
    if (isAutoPickOrderCompletedStatus(refreshedOrder.status)) {
      await syncBrushOrderFromCompletedAutoPickOrder(session.id, refreshedOrder.id).catch((brushError) => {
        console.error("Failed to sync brush order after order sync:", brushError);
      });
      await syncAutoOutboundFromCompletedAutoPickOrder(session.id, refreshedOrder.id).catch((outboundError) => {
        console.error("Failed to auto-create outbound after order sync:", outboundError);
      });
    }

    if (
      !isAutoPickOrderDeliveringStatus(refreshedOrder.status)
      && !isAutoPickOrderCompletedStatus(refreshedOrder.status)
      && !isAutoPickOrderCancelledStatus(refreshedOrder.status)
      && !isAutoPickOrderAbnormalStatus(refreshedOrder.status)
    ) {
      await clearAutoPickOrderMainSystemSelfDelivery(session.id, refreshedOrder.id, "sync-restored-non-self-delivery");
    }

    const backfill = await backfillPersistedAutoPickOrderFields(session.id, {
      orderIds: [refreshedOrder.id],
    });

    const normalized = normalizeAutoPickOrderPayload(refreshedOrder.rawPayload);

    return NextResponse.json({
      ok: true,
      id: refreshedOrder.id,
      orderNo: refreshedOrder.orderNo,
      platform: refreshedOrder.platform,
      status: refreshedOrder.status,
      completedAt: normalized?.completedAt || null,
      lastSyncedAt: refreshedOrder.lastSyncedAt,
      backfilled: backfill.count,
    });
  } catch (error) {
    console.error("Failed to sync auto-pick order:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to sync order",
    }, { status: 500 });
  }
}
