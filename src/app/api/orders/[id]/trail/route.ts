import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { fetchMaiyatianDeliveryTrail } from "@/lib/autoPickOrders";

export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) return NextResponse.json({ error: "无权查看配送轨迹" }, { status: 403 });
  const { id } = await context.params;
  const isAdmin = session.role === "SUPER_ADMIN" || Boolean(session.role && String(session.role).includes("管理"))
    || (Array.isArray(session.permissions) && session.permissions.some((value) => ["*", "members:manage", "admin"].includes(value)));
  const order = await prisma.autoPickOrder.findFirst({ where: { id, ...(isAdmin ? {} : { userId: session.id }) }, select: { userId: true, deliveryId: true, rawPayload: true } });
  if (!order) return NextResponse.json({ error: "订单不存在或无权查看" }, { status: 404 });
  const raw = order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload) ? order.rawPayload : {};
  const delivery = raw.delivery && typeof raw.delivery === "object" && !Array.isArray(raw.delivery) ? raw.delivery : {};
  const deliveryId = String(order.deliveryId || delivery.id || "").trim();
  if (!deliveryId) return NextResponse.json({ error: "该订单暂无配送单，请同步订单后重试。" }, { status: 409 });
  try {
    return NextResponse.json(await fetchMaiyatianDeliveryTrail(order.userId, deliveryId), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "获取骑手位置失败，请检查麦芽田登录配置并稍后刷新。" }, { status: 502 });
  }
}
