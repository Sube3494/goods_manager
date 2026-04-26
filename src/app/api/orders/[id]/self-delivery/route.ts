import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { callAutoPickCommand, refreshAutoPickOrderFromPlugin } from "@/lib/autoPickOrders";
import { cancelAutoCompleteJob, ensureAutoCompleteJob } from "@/lib/autoPickAutoComplete";
import { getEstimatedAutoCompleteAt } from "@/lib/autoPickSchedule";

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
      String(record.map_address || "")
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

    if (isPickupOrder(order.rawPayload, order.userAddress)) {
      return NextResponse.json({ error: "Pickup order does not require self delivery" }, { status: 409 });
    }

    const result = await callAutoPickCommand(session.id, "/self-delivery", {
      platform: order.platform,
      dailyPlatformSequence: order.dailyPlatformSequence,
      orderNo: order.orderNo,
      sourceId: order.sourceId,
      logisticId: order.logisticId,
    });

    if (result.ok) {
      const refreshedOrder = await refreshAutoPickOrderFromPlugin(session.id, {
        id: order.sourceId,
        platform: order.platform,
        orderNo: order.orderNo,
        orderTime: order.orderTime,
      }).catch((refreshError) => {
        console.error("Failed to refresh auto-pick order after self delivery:", refreshError);
        return null;
      });

      const schedulingOrder = refreshedOrder || order;
      const autoCompleteAt = getEstimatedAutoCompleteAt(schedulingOrder);
      await prisma.autoPickOrder.update({
        where: { id },
        data: {
          status: "配送中",
          deliveryDeadline: refreshedOrder?.deliveryDeadline || order.deliveryDeadline || null,
          autoCompleteAt: autoCompleteAt || null,
        },
      });

      if (autoCompleteAt) {
        await ensureAutoCompleteJob({
          userId: session.id,
          orderId: id,
          dueAt: autoCompleteAt,
        });
      } else {
        await cancelAutoCompleteJob(id, "missing-auto-complete-time");
      }
    }

    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error("Failed to start self delivery:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to start self delivery",
    }, { status: 500 });
  }
}
