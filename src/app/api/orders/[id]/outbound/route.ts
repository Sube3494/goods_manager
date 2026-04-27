import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUserAny } from "@/lib/auth";
import { createOutboundFromAutoPickOrder } from "@/lib/autoPickOrders";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUserAny("order:manage", "outbound:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const preferredMappedShopName = String(body?.matchedShopName || "").trim() || null;
    const result = await createOutboundFromAutoPickOrder(session.id, id, {
      preferredMappedShopName,
    });

    if (result.ok) {
      if (result.duplicated) {
        return NextResponse.json({ error: "该订单已生成出库单", outboundOrderId: result.outboundOrderId }, { status: 409 });
      }

      return NextResponse.json({
        ok: true,
        outboundOrderId: result.outboundOrderId,
      });
    }

    switch (result.reason) {
      case "order-not-found":
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      case "order-deleted":
        return NextResponse.json({ error: "已删除订单不能生成出库" }, { status: 409 });
      case "order-cancelled":
        return NextResponse.json({ error: "已取消订单不能生成出库" }, { status: 409 });
      case "no-items":
        return NextResponse.json({ error: "没有可生成出库的商品" }, { status: 400 });
      default:
        return NextResponse.json({ error: "Failed to create outbound order" }, { status: 409 });
    }
  } catch (error) {
    console.error("Failed to create outbound from auto-pick order:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to create outbound order",
    }, { status: 500 });
  }
}
