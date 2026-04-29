import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { normalizeAutoPickOrderPayload, refreshAutoPickOrderFromPlugin, syncAutoOutboundFromCompletedAutoPickOrder, syncBrushOrderFromCompletedAutoPickOrder, tryStartPendingAutoPickSelfDelivery } from "@/lib/autoPickOrders";
import { cancelAutoCompleteJob } from "@/lib/autoPickAutoComplete";
import { isAutoPickOrderCancelledStatus, isAutoPickOrderCompletedStatus } from "@/lib/autoPickOrderStatus";

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
      await cancelAutoCompleteJob(order.id, "order-removed-from-maiyatian");
      await prisma.autoPickOrder.deleteMany({
        where: {
          id: order.id,
          userId: session.id,
        },
      });

      return NextResponse.json({
        ok: true,
        id: order.id,
        orderNo: order.orderNo,
        platform: order.platform,
        removed: true,
      });
    }

    if (isAutoPickOrderCompletedStatus(refreshedOrder.status) || isAutoPickOrderCancelledStatus(refreshedOrder.status)) {
      await cancelAutoCompleteJob(order.id, "order-synced-to-terminal");
    }
    if (isAutoPickOrderCompletedStatus(refreshedOrder.status)) {
      await syncBrushOrderFromCompletedAutoPickOrder(session.id, refreshedOrder.id).catch((brushError) => {
        console.error("Failed to sync brush order after order sync:", brushError);
      });
      await syncAutoOutboundFromCompletedAutoPickOrder(session.id, refreshedOrder.id).catch((outboundError) => {
        console.error("Failed to auto-create outbound after order sync:", outboundError);
      });
    }

    const deferredSelfDelivery = await tryStartPendingAutoPickSelfDelivery(session.id, refreshedOrder.id).catch((deferredError) => {
      console.error("Failed to process pending self delivery after order sync:", deferredError);
      return null;
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
      deferredSelfDeliveryStarted: Boolean(deferredSelfDelivery?.ok),
    });
  } catch (error) {
    console.error("Failed to sync auto-pick order:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to sync order",
    }, { status: 500 });
  }
}
