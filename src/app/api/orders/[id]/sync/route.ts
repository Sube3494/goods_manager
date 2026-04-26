import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { refreshAutoPickOrderFromPlugin } from "@/lib/autoPickOrders";
import { cancelAutoCompleteJob } from "@/lib/autoPickAutoComplete";

export const dynamic = "force-dynamic";

function isCancelledStatus(status?: string | null) {
  const text = String(status || "");
  return text.includes("取消") || text.includes("退款") || text.includes("关闭");
}

function isCompletedStatus(status?: string | null) {
  const text = String(status || "").trim();
  const normalized = text.toLowerCase();
  return text.includes("已完成")
    || normalized === "done"
    || normalized === "completed"
    || normalized === "complete"
    || normalized === "finished"
    || normalized === "finish";
}

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

    if (isCancelledStatus(order.status)) {
      return NextResponse.json({
        error: "Order already cancelled",
      }, { status: 409 });
    }

    const refreshedOrder = await refreshAutoPickOrderFromPlugin(session.id, {
      id: order.sourceId,
      platform: order.platform,
      orderNo: order.orderNo,
      orderTime: order.orderTime,
    });

    if (!refreshedOrder) {
      return NextResponse.json({
        error: "插件中未找到该订单的最新状态",
      }, { status: 404 });
    }

    if (isCompletedStatus(refreshedOrder.status) || isCancelledStatus(refreshedOrder.status)) {
      await cancelAutoCompleteJob(order.id, "order-synced-to-terminal");
    }

    return NextResponse.json({
      ok: true,
      id: refreshedOrder.id,
      orderNo: refreshedOrder.orderNo,
      platform: refreshedOrder.platform,
      status: refreshedOrder.status,
      lastSyncedAt: refreshedOrder.lastSyncedAt,
    });
  } catch (error) {
    console.error("Failed to sync auto-pick order:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to sync order",
    }, { status: 500 });
  }
}
