import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { callAutoPickCommand } from "@/lib/autoPickOrders";
import {
  isAutoPickOrderCancelledStatus,
  isAutoPickOrderCompletedStatus,
  isAutoPickOrderDeliveringStatus,
  isAutoPickOrderRiderAssigned,
  isAutoPickPickupOrder,
} from "@/lib/autoPickOrderStatus";

export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) return NextResponse.json({ error: "Permission denied" }, { status: 403 });

  try {
    const { id } = await context.params;
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

    const result = await callAutoPickCommand(order.userId, "/delivery-options", { sourceId });
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error("Failed to load delivery options:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "获取配送报价失败" }, { status: 500 });
  }
}
