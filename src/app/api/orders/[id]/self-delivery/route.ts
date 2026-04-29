import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { markAutoPickOrderPendingSelfDelivery, tryStartPendingAutoPickSelfDelivery } from "@/lib/autoPickOrders";
import {
  canAutoPickStartSelfDelivery,
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

    if (isAutoPickPickupOrder(order.rawPayload, order.userAddress)) {
      return NextResponse.json({ error: "Pickup order does not require self delivery" }, { status: 409 });
    }

    if (!canAutoPickStartSelfDelivery(order.status, order.rawPayload)) {
      await markAutoPickOrderPendingSelfDelivery(session.id, id);
      return NextResponse.json({
        ok: true,
        pending: true,
        reason: "picking-not-completed",
      });
    }

    const result = await tryStartPendingAutoPickSelfDelivery(session.id, id);
    if (result.ok) {
      return NextResponse.json(result.result?.data ?? { ok: true }, { status: result.result?.status ?? 200 });
    }

    return NextResponse.json({
      error: result.reason || "Failed to start self delivery",
    }, { status: 409 });
  } catch (error) {
    console.error("Failed to start self delivery:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to start self delivery",
    }, { status: 500 });
  }
}
