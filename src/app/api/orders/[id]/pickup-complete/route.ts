import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { callAutoPickCommand, refreshAutoPickOrderFromPlugin, syncAutoOutboundFromCompletedAutoPickOrder, syncBrushOrderFromCompletedAutoPickOrder } from "@/lib/autoPickOrders";
import { cancelAutoCompleteJob } from "@/lib/autoPickAutoComplete";
import { emitAutoPickOrderEvent } from "@/lib/autoPickOrderEvents";
import {
  isAutoPickOrderCancelledStatus,
  isAutoPickOrderCompletedStatus,
  isAutoPickPickupOrder,
} from "@/lib/autoPickOrderStatus";

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

    if (isAutoPickOrderCompletedStatus(order.status)) {
      return NextResponse.json({ error: "Order already completed" }, { status: 409 });
    }

    if (isAutoPickOrderCancelledStatus(order.status)) {
      return NextResponse.json({ error: "Order already cancelled" }, { status: 409 });
    }

    if (!isAutoPickPickupOrder(order.rawPayload, order.userAddress)) {
      return NextResponse.json({ error: "Non-pickup order does not require pickup complete" }, { status: 409 });
    }

    const result = await callAutoPickCommand(session.id, "/pickup-complete", {
      platform: order.platform,
      dailyPlatformSequence: order.dailyPlatformSequence,
      orderNo: order.orderNo,
      sourceId: order.sourceId,
      logisticId: order.logisticId,
    });

    if (result.ok) {
      await prisma.autoPickOrder.update({
        where: { id: order.id },
        data: {
          status: "已完成",
          autoCompleteAt: null,
          lastSyncedAt: new Date(),
        },
      });
      emitAutoPickOrderEvent({
        type: "upsert",
        userId: session.id,
        orderId: order.id,
        orderNo: order.orderNo,
        platform: order.platform,
        at: new Date().toISOString(),
      });
      await cancelAutoCompleteJob(order.id, "manual-pickup-complete");
      await syncBrushOrderFromCompletedAutoPickOrder(session.id, order.id).catch((brushError) => {
        console.error("Failed to sync brush order after pickup complete:", brushError);
      });
      await syncAutoOutboundFromCompletedAutoPickOrder(session.id, order.id).catch((outboundError) => {
        console.error("Failed to auto-create outbound after pickup complete:", outboundError);
      });

      void refreshAutoPickOrderFromPlugin(session.id, {
        id: order.sourceId,
        platform: order.platform,
        orderNo: order.orderNo,
        orderTime: order.orderTime,
      }).catch((refreshError) => {
        console.error("Failed to refresh auto-pick order after pickup complete:", refreshError);
      });
    }

    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error("Failed to complete pickup:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to complete pickup",
    }, { status: 500 });
  }
}
