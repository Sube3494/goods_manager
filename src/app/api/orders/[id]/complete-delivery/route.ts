import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { callAutoPickCommand, refreshAutoPickOrderFromPlugin, resolveAutoPickCommandPlatform, syncAutoOutboundFromCompletedAutoPickOrder, syncBrushOrderFromCompletedAutoPickOrder, wasAutoPickOrderSelfDeliveryTriggeredByMainSystem } from "@/lib/autoPickOrders";
import { cancelAutoCompleteJob } from "@/lib/autoPickAutoComplete";
import { emitAutoPickOrderEvent } from "@/lib/autoPickOrderEvents";
import {
  isAutoPickOrderCancelledStatus,
  isAutoPickOrderCompletedStatus,
  isAutoPickOrderDeliveringStatus,
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
    const isAdmin = Boolean(
      session.role === "SUPER_ADMIN" ||
      (session.role && String(session.role).includes("管理")) ||
      (Array.isArray(session.permissions) && (session.permissions.includes("*") || session.permissions.includes("members:manage") || session.permissions.includes("admin")))
    );
    const order = await prisma.autoPickOrder.findFirst({
      where: {
        id,
        ...(isAdmin ? {} : { userId: session.id }),
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

    if (isAutoPickPickupOrder(order.rawPayload, order.userAddress, order.shopAddress)) {
      return NextResponse.json({ error: "Pickup order does not require complete delivery" }, { status: 409 });
    }

    if (!isAutoPickOrderDeliveringStatus(order.status)) {
      return NextResponse.json({ error: "Order is not delivering yet" }, { status: 409 });
    }

    const triggeredByMainSystem = await wasAutoPickOrderSelfDeliveryTriggeredByMainSystem(order.userId, order.orderNo);
    if (!triggeredByMainSystem) {
      return NextResponse.json({ error: "Order is not main-system self delivery" }, { status: 409 });
    }

    const commandPlatform = resolveAutoPickCommandPlatform(order);
    const result = await callAutoPickCommand(order.userId, "/complete-delivery", {
      platform: commandPlatform,
      dailyPlatformSequence: order.dailyPlatformSequence,
      orderNo: order.orderNo,
      sourceId: order.sourceId,
      deliveryId: order.deliveryId,
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
        userId: order.userId,
        orderId: order.id,
        orderNo: order.orderNo,
        platform: order.platform,
        at: new Date().toISOString(),
      });
      await cancelAutoCompleteJob(order.id, "manual-complete-delivery");
      await syncBrushOrderFromCompletedAutoPickOrder(order.userId, order.id).catch((brushError) => {
        console.error("Failed to sync brush order after complete delivery:", brushError);
      });
      await syncAutoOutboundFromCompletedAutoPickOrder(order.userId, order.id).catch((outboundError) => {
        console.error("Failed to auto-create outbound after complete delivery:", outboundError);
      });

      void refreshAutoPickOrderFromPlugin(order.userId, {
        id: order.sourceId,
        platform: commandPlatform,
        orderNo: order.orderNo,
        orderTime: order.orderTime,
      }).catch((refreshError) => {
        console.error("Failed to refresh auto-pick order after complete delivery:", refreshError);
      });
    }

    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error("Failed to complete delivery:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to complete delivery",
    }, { status: 500 });
  }
}
