import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { fetchMaiyatianCourierPhotos } from "@/lib/autoPickOrders";

export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) return NextResponse.json({ error: "无权查看配送照片" }, { status: 403 });

  const { id } = await context.params;
  const isAdmin =
    session.role === "SUPER_ADMIN" ||
    Boolean(session.role && String(session.role).includes("管理")) ||
    (Array.isArray(session.permissions) &&
      session.permissions.some((value) => ["*", "members:manage", "admin"].includes(value)));

  const order = await prisma.autoPickOrder.findFirst({
    where: { id, ...(isAdmin ? {} : { userId: session.id }) },
    select: { userId: true, deliveryId: true, rawPayload: true },
  });

  if (!order) return NextResponse.json({ error: "订单不存在或无权查看" }, { status: 404 });

  const raw = order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)
    ? (order.rawPayload as Record<string, unknown>)
    : {};
  const delivery = raw.delivery && typeof raw.delivery === "object" && !Array.isArray(raw.delivery)
    ? (raw.delivery as Record<string, unknown>)
    : {};

  const deliveryId = String(order.deliveryId || delivery.id || raw.delivery_id || "").trim();
  const tag = String(
    delivery.logistic_tag ||
    delivery.logisticTag ||
    delivery.tag ||
    raw.logistic_tag ||
    raw.tag ||
    ""
  ).trim();
  const logisticName = String(delivery.logistic_name || delivery.logisticName || "").trim();

  if (!deliveryId || deliveryId === "0") {
    return NextResponse.json({
      supported: false,
      pickupPhotos: [],
      deliveryPhotos: [],
      message: "该订单暂无第三方配送单",
    });
  }

  if (tag === "oneself" || /自配|自配送|商家自配/i.test(logisticName)) {
    return NextResponse.json({
      supported: false,
      isSelfDelivery: true,
      pickupPhotos: [],
      deliveryPhotos: [],
      message: "商家自配订单无需骑手拍照",
    });
  }

  if (!tag) {
    return NextResponse.json({
      supported: false,
      pickupPhotos: [],
      deliveryPhotos: [],
      message: "配送平台代号未知，暂无法获取骑手照片",
    });
  }

  try {
    const result = await fetchMaiyatianCourierPhotos(order.userId, deliveryId, tag);
    return NextResponse.json(
      {
        ...result,
        deliveryId,
        tag,
        logisticName,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "获取骑手照片失败";
    return NextResponse.json(
      {
        supported: false,
        pickupPhotos: [],
        deliveryPhotos: [],
        error: errorMsg,
        message: "获取骑手照片失败，请检查麦芽田登录状态或稍后重试。",
      },
      { status: 502 }
    );
  }
}
