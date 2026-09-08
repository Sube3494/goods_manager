import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { fetchMaiyatianDeliveryTrail } from "@/lib/autoPickOrders";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function isDeliveredOrder(order: {
  status?: string | null;
  delivery?: unknown;
  rawPayload?: unknown;
  autoCompleteJob?: { completedAt?: Date | null } | null;
}) {
  const raw = isRecord(order.rawPayload) ? order.rawPayload : {};
  const delivery = isRecord(order.delivery)
    ? order.delivery
    : (isRecord(raw.delivery) ? raw.delivery : {});
  const statusText = [
    order.status,
    raw.status,
    raw.statusName,
    raw.status_name,
    raw.orderStatus,
    raw.order_status,
    raw.finished_time,
    raw.finishedTime,
    raw.completedAt,
    delivery.track,
    delivery.status,
    delivery.statusName,
    delivery.status_name,
    delivery.completedTime,
    delivery.completed_time,
    delivery.finishedTime,
    delivery.finished_time,
  ].map(readString).filter(Boolean).join(" ");

  return Boolean(order.autoCompleteJob?.completedAt)
    || /已完成|已送达|配送完成|done|finished|completed/i.test(statusText);
}

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) return NextResponse.json({ error: "无权查看配送轨迹" }, { status: 403 });
  const { id } = await context.params;
  const isAdmin = session.role === "SUPER_ADMIN" || Boolean(session.role && String(session.role).includes("管理"))
    || (Array.isArray(session.permissions) && session.permissions.some((value) => ["*", "members:manage", "admin"].includes(value)));
  const order = await prisma.autoPickOrder.findFirst({
    where: { id, ...(isAdmin ? {} : { userId: session.id }) },
    select: {
      userId: true,
      deliveryId: true,
      status: true,
      delivery: true,
      rawPayload: true,
      autoCompleteJob: { select: { completedAt: true } },
    },
  });
  if (!order) return NextResponse.json({ error: "订单不存在或无权查看" }, { status: 404 });

  if (isDeliveredOrder(order)) {
    return NextResponse.json(
      { skipped: true, phase: "delivered", message: "订单已送达，无需获取骑手位置。" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const raw = isRecord(order.rawPayload) ? order.rawPayload : {};
  const delivery = isRecord(order.delivery) ? order.delivery : (isRecord(raw.delivery) ? raw.delivery : {});
  const deliveryId = String(order.deliveryId || delivery.id || "").trim();
  if (!deliveryId) return NextResponse.json({ error: "该订单暂无配送单，请同步订单后重试。" }, { status: 409 });
  try {
    return NextResponse.json(await fetchMaiyatianDeliveryTrail(order.userId, deliveryId), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "获取骑手位置失败，请检查麦芽田登录配置并稍后刷新。" }, { status: 502 });
  }
}
