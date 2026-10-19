import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { processQueuedSelfDeliveryOrder, setQueuedSelfDelivery } from "@/lib/queuedSelfDelivery";
import { readQueuedSelfDelivery } from "@/lib/queuedSelfDeliveryRules";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  const { id } = await context.params;
  const order = await prisma.autoPickOrder.findFirst({ where: { id, ...(session.role === "SUPER_ADMIN" ? {} : { userId: session.id }) } });
  if (!order) return NextResponse.json({ error: "订单不存在" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "请指定是否启用拣货后自配" }, { status: 400 });
  try {
    const updated = await setQueuedSelfDelivery(order, body.enabled);
    if (body.enabled) void processQueuedSelfDeliveryOrder(id).catch((error) => console.error("Failed to check queued self delivery:", error));
    return NextResponse.json({ order: updated, message: readQueuedSelfDelivery(updated.queuedSelfDelivery)?.status === "waiting" ? "已标记，拣货完成后自动自配" : "已取消拣货后自配" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "设置失败" }, { status: 409 });
  }
}
