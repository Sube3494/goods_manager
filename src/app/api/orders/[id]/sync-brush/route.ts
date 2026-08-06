import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { syncBrushOrderFromCompletedAutoPickOrder } from "@/lib/autoPickOrders";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const rawCommission = body?.commission;
    const parsedCommission = typeof rawCommission === "number"
      ? rawCommission
      : typeof rawCommission === "string" && rawCommission.trim() !== ""
        ? parseFloat(rawCommission)
        : undefined;
    const commission = Number.isFinite(parsedCommission) && (parsedCommission as number) >= 0
      ? (parsedCommission as number)
      : undefined;

    const result = await syncBrushOrderFromCompletedAutoPickOrder(session.id, id, {
      allowSelfDeliveryFallback: true,
      forceInclude: true,
      overwriteExisting: true,
      commission,
    });

    if (result.ok) {
      return NextResponse.json(result);
    }

    switch (result.reason) {
      case "order-not-found":
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      case "order-not-completed":
        return NextResponse.json({ error: "订单未完成，暂时不能同步刷单" }, { status: 409 });
      case "missing-matched-products":
        return NextResponse.json({
          error: "订单商品还没匹配到系统商品，暂时不能同步刷单",
          missingItems: result.missingItems || [],
        }, { status: 409 });
      case "not-self-delivery":
        return NextResponse.json({ error: "这不是自配送订单，不能同步刷单" }, { status: 409 });
      default:
        return NextResponse.json({ error: "当前订单不符合刷单同步条件" }, { status: 409 });
    }
  } catch (error) {
    console.error("Failed to sync brush order manually:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to sync brush order",
    }, { status: 500 });
  }
}
