import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { callAutoPickCommand, getAutoPickIntegrationConfigByUserId, markAutoPickOrderMainSystemSelfDelivery, refreshAutoPickOrderFromPlugin } from "@/lib/autoPickOrders";
import { cancelAutoCompleteJob, ensureAutoCompleteJob } from "@/lib/autoPickAutoComplete";
import {
  doesAutoPickOrderRequirePickConfirmation,
  isAutoPickOrderAbnormalStatus,
  isAutoPickOrderCancelledStatus,
  isAutoPickOrderCompletedStatus,
  isAutoPickPickCompleted,
  isAutoPickPickupOrder,
  isAutoPickSelfDeliveryStarted,
} from "@/lib/autoPickOrderStatus";
import { getEstimatedAutoCompleteAt } from "@/lib/autoPickSchedule";

export const dynamic = "force-dynamic";

async function waitForConfirmedSelfDelivery(
  userId: string,
  lookup: { id?: string; platform?: string; orderNo?: string; orderTime?: Date | string | null },
  attempts = 3,
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const refreshedOrder = await refreshAutoPickOrderFromPlugin(userId, lookup).catch((refreshError) => {
      console.error("Failed to refresh auto-pick order after self delivery:", refreshError);
      return null;
    });

    if (refreshedOrder && isAutoPickSelfDeliveryStarted(refreshedOrder)) {
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

    if (isAutoPickPickupOrder(order.rawPayload, order.userAddress)) {
      return NextResponse.json({ error: "Pickup order does not require self delivery" }, { status: 409 });
    }

    const requiresPickConfirmation = doesAutoPickOrderRequirePickConfirmation(order.platform);
    const pickedOrder = !requiresPickConfirmation
      ? order
      : isAutoPickPickCompleted(order.rawPayload)
        ? order
        : null;
    if (requiresPickConfirmation && !pickedOrder) {
      return NextResponse.json({
        error: "还没收到这单“上报拣货成功”的消息，暂时不能自配。",
      }, { status: 409 });
    }

    const commandBaseOrder = pickedOrder || order;
    let commandOrder = commandBaseOrder;
    if (!String(commandBaseOrder.sourceId || "").trim() || !String(commandBaseOrder.logisticId || "").trim()) {
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
      const refreshedOrder = await waitForConfirmedSelfDelivery(session.id, {
        id: sourceId,
        platform: commandOrder.platform,
        orderNo: commandOrder.orderNo,
        orderTime: commandOrder.orderTime,
      });

      if (!refreshedOrder) {
        return NextResponse.json({
          error: "自配指令已发出，但暂未确认麦芽田已切到自配/配送中状态，请先同步订单确认成功后再继续。",
        }, { status: 409 });
      }

      const schedulingOrder = refreshedOrder;
      const integrationConfig = await getAutoPickIntegrationConfigByUserId(session.id);
      const autoCompleteBlocked = isAutoPickOrderAbnormalStatus(schedulingOrder.status);
      const autoCompleteAt = autoCompleteBlocked
        ? null
        : getEstimatedAutoCompleteAt(schedulingOrder, integrationConfig.selfDeliveryTiming);
      await prisma.autoPickOrder.update({
        where: { id },
        data: {
          status: autoCompleteBlocked ? (schedulingOrder.status || order.status) : (schedulingOrder.status || "配送中"),
          deliveryDeadline: refreshedOrder.deliveryDeadline || order.deliveryDeadline || null,
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
        await cancelAutoCompleteJob(id, autoCompleteBlocked ? "abnormal-status-no-auto-complete" : "missing-auto-complete-time");
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
