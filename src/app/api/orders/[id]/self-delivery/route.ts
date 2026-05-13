import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { callAutoPickCommand, getAutoPickIntegrationConfigByUserId, markAutoPickOrderMainSystemSelfDelivery, refreshAutoPickOrderFromPlugin } from "@/lib/autoPickOrders";
import { cancelAutoCompleteJob, ensureAutoCompleteJob } from "@/lib/autoPickAutoComplete";
import {
  isAutoPickOrderAbnormalStatus,
  isAutoPickOrderCancelledStatus,
  isAutoPickOrderCompletedStatus,
  isAutoPickOrderDeliveringStatus,
  isAutoPickPickupOrder,
} from "@/lib/autoPickOrderStatus";
import { getEstimatedAutoCompleteAt } from "@/lib/autoPickSchedule";

export const dynamic = "force-dynamic";

async function waitForDeliveringSelfDelivery(
  userId: string,
  lookup: { id?: string; platform?: string; orderNo?: string; orderTime?: Date | string | null },
  attempts = 3,
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const refreshedOrder = await refreshAutoPickOrderFromPlugin(userId, lookup).catch((refreshError) => {
      console.error("Failed to refresh auto-pick order after self delivery:", refreshError);
      return null;
    });

    if (refreshedOrder && isAutoPickOrderDeliveringStatus(refreshedOrder.status)) {
      return refreshedOrder;
    }

    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }

  return null;
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

    if (isAutoPickOrderCompletedStatus(order.status)) {
      return NextResponse.json({ error: "Order already completed" }, { status: 409 });
    }

    if (isAutoPickOrderCancelledStatus(order.status)) {
      return NextResponse.json({ error: "Order already cancelled" }, { status: 409 });
    }

    if (isAutoPickPickupOrder(order.rawPayload, order.userAddress, order.shopAddress)) {
      return NextResponse.json({ error: "Pickup order does not require self delivery" }, { status: 409 });
    }

    const commandBaseOrder = order;
    let commandOrder = commandBaseOrder;
    const shouldRefreshBeforeSelfDelivery = isAutoPickOrderAbnormalStatus(order.status)
      || !String(commandBaseOrder.sourceId || "").trim()
      || !String(commandBaseOrder.logisticId || "").trim();
    if (shouldRefreshBeforeSelfDelivery) {
      const refreshedOrder = await refreshAutoPickOrderFromPlugin(session.id, {
        id: commandBaseOrder.sourceId,
        platform: commandBaseOrder.platform,
        orderNo: commandBaseOrder.orderNo,
        orderTime: commandBaseOrder.orderTime,
      }).catch((refreshError) => {
        console.error("Failed to refresh auto-pick order before self delivery:", refreshError);
        return null;
      });

      if (refreshedOrder) {
        commandOrder = refreshedOrder;
      }
    }

    const sourceId = String(commandOrder.sourceId || "").trim();
    const logisticId = String(commandOrder.logisticId || "").trim();
    if (!sourceId || !logisticId) {
      return NextResponse.json({
        error: "订单缺少自配所需信息，已尝试自动同步但仍未获取到配送标识，请先手动同步订单后再试。",
      }, { status: 409 });
    }

    const result = await callAutoPickCommand(session.id, "/self-delivery", {
      platform: commandOrder.platform,
      dailyPlatformSequence: commandOrder.dailyPlatformSequence,
      orderNo: commandOrder.orderNo,
      sourceId,
      logisticId,
    });

    if (result.ok) {
      const refreshedOrder = await waitForDeliveringSelfDelivery(session.id, {
        id: sourceId,
        platform: commandOrder.platform,
        orderNo: commandOrder.orderNo,
        orderTime: commandOrder.orderTime,
      });

      const latestOrder = refreshedOrder || await refreshAutoPickOrderFromPlugin(session.id, {
        id: sourceId,
        platform: commandOrder.platform,
        orderNo: commandOrder.orderNo,
        orderTime: commandOrder.orderTime,
      }).catch((refreshError) => {
        console.error("Failed to refresh auto-pick order after pending self delivery:", refreshError);
        return null;
      });

      const schedulingOrder = latestOrder || commandOrder;
      const confirmedDelivering = isAutoPickOrderDeliveringStatus(schedulingOrder.status);
      const integrationConfig = confirmedDelivering
        ? await getAutoPickIntegrationConfigByUserId(session.id)
        : null;
      const autoCompleteBlocked = isAutoPickOrderAbnormalStatus(schedulingOrder.status);
      const autoCompleteAt = confirmedDelivering && !autoCompleteBlocked && integrationConfig
        ? getEstimatedAutoCompleteAt(schedulingOrder, integrationConfig.selfDeliveryTiming)
        : null;
      await prisma.autoPickOrder.update({
        where: { id },
        data: {
          status: schedulingOrder.status || order.status,
          deliveryDeadline: schedulingOrder.deliveryDeadline || order.deliveryDeadline || null,
          autoCompleteAt: autoCompleteAt || null,
        },
      });
      await markAutoPickOrderMainSystemSelfDelivery(session.id, id);

      if (autoCompleteAt) {
        await ensureAutoCompleteJob({
          userId: session.id,
          orderId: id,
          dueAt: autoCompleteAt,
        });
      } else {
        await cancelAutoCompleteJob(
          id,
          autoCompleteBlocked
            ? "abnormal-status-no-auto-complete"
            : confirmedDelivering
              ? "missing-auto-complete-time"
              : "waiting-delivering-status"
        );
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
