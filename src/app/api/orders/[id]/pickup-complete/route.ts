import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { callAutoPickCommand, refreshAutoPickOrderFromPlugin } from "@/lib/autoPickOrders";
import { cancelAutoCompleteJob } from "@/lib/autoPickAutoComplete";

export const dynamic = "force-dynamic";

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

function isCancelledStatus(status?: string | null) {
  const text = String(status || "").trim();
  const normalized = text.toLowerCase();
  return text.includes("取消")
    || text.includes("退款")
    || text.includes("关闭")
    || normalized === "cancel"
    || normalized === "cancelled"
    || normalized === "canceled"
    || normalized === "closed"
    || normalized === "refund";
}

function isPickupOrder(rawPayload: unknown, userAddress?: string | null) {
  const candidates = [userAddress];

  if (rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)) {
    const record = rawPayload as Record<string, unknown>;
    candidates.push(
      String(record.unencrypted_map_address || ""),
      String(record.unencrypted_address || ""),
      String(record.user_remark || ""),
      String(record.address || ""),
      String(record.map_address || ""),
      String(record.deliveryType || ""),
      String(record.delivery_type || ""),
      String(record.fulfilmentType || ""),
      String(record.fulfilment_type || "")
    );
  }

  return candidates.some((item) => /到店自取|门店自取|上门自取|自提/.test(String(item || "").trim()));
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

    if (isCompletedStatus(order.status)) {
      return NextResponse.json({ error: "Order already completed" }, { status: 409 });
    }

    if (isCancelledStatus(order.status)) {
      return NextResponse.json({ error: "Order already cancelled" }, { status: 409 });
    }

    if (!isPickupOrder(order.rawPayload, order.userAddress)) {
      return NextResponse.json({ error: "Non-pickup order does not require pickup complete" }, { status: 409 });
    }

    const result = await callAutoPickCommand(session.id, "/pickup-complete", {
      platform: order.platform,
      dailyPlatformSequence: order.dailyPlatformSequence,
      orderNo: order.orderNo,
      sourceId: order.sourceId,
      logisticId: order.logisticId,
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
      await cancelAutoCompleteJob(order.id, "manual-pickup-complete");

      void refreshAutoPickOrderFromPlugin(session.id, {
        id: order.sourceId,
        platform: order.platform,
        orderNo: order.orderNo,
        orderTime: order.orderTime,
      }).catch((refreshError) => {
        console.error("Failed to refresh auto-pick order after pickup complete:", refreshError);
      });
    }

    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error("Failed to complete pickup:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to complete pickup",
    }, { status: 500 });
  }
}
