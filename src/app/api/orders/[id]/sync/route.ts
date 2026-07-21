import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import {
  backfillPersistedAutoPickOrderFields,
  clearAutoPickOrderMainSystemSelfDelivery,
  normalizeAutoPickOrderPayload,
  readCustomerMaskedPhoneFromRawPayload,
  readCustomerNameFromRawPayload,
  readCustomerPhoneExtensionFromRawPayload,
  readCustomerPhoneFromRawPayload,
  readRiderPhoneFromDelivery,
  readRiderPhoneFromRawPayload,
  refreshAutoPickOrderFromPlugin,
  syncAutoOutboundFromCompletedAutoPickOrder,
  syncBrushOrderFromCompletedAutoPickOrder,
} from "@/lib/autoPickOrders";
import { cancelAutoCompleteJob } from "@/lib/autoPickAutoComplete";
import { isAutoPickOrderAbnormalStatus, isAutoPickOrderCancelledStatus, isAutoPickOrderCompletedStatus, isAutoPickOrderDeliveringStatus } from "@/lib/autoPickOrderStatus";

export const dynamic = "force-dynamic";

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

    if (isAutoPickOrderCancelledStatus(order.status)) {
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
        ok: false,
        id: order.id,
        orderNo: order.orderNo,
        platform: order.platform,
        preserved: true,
        error: "在第三方平台未查询到该订单，已保护性保留本地记录",
      }, { status: 409 });
    }

    if ((refreshedOrder as any).isDeleted) {
      return NextResponse.json({
        ok: true,
        id: order.id,
        orderNo: order.orderNo,
        platform: order.platform,
        deleted: true,
        message: "平台该订单已删除，已同步清理本地记录",
      });
    }

    if (
      isAutoPickOrderCompletedStatus(refreshedOrder.status)
      || isAutoPickOrderCancelledStatus(refreshedOrder.status)
      || isAutoPickOrderAbnormalStatus(refreshedOrder.status)
    ) {
      await cancelAutoCompleteJob(
        order.id,
        isAutoPickOrderAbnormalStatus(refreshedOrder.status) ? "order-synced-to-abnormal" : "order-synced-to-terminal"
      );
    }
    if (isAutoPickOrderCompletedStatus(refreshedOrder.status)) {
      await syncBrushOrderFromCompletedAutoPickOrder(session.id, refreshedOrder.id).catch((brushError) => {
        console.error("Failed to sync brush order after order sync:", brushError);
      });
      await syncAutoOutboundFromCompletedAutoPickOrder(session.id, refreshedOrder.id).catch((outboundError) => {
        console.error("Failed to auto-create outbound after order sync:", outboundError);
      });
    }

    if (
      !isAutoPickOrderDeliveringStatus(refreshedOrder.status)
      && !isAutoPickOrderCompletedStatus(refreshedOrder.status)
      && !isAutoPickOrderCancelledStatus(refreshedOrder.status)
      && !isAutoPickOrderAbnormalStatus(refreshedOrder.status)
    ) {
      await clearAutoPickOrderMainSystemSelfDelivery(session.id, refreshedOrder.id, "sync-restored-non-self-delivery");
    }

    const backfill = await backfillPersistedAutoPickOrderFields(session.id, {
      orderIds: [refreshedOrder.id],
    });

    const normalized = normalizeAutoPickOrderPayload(refreshedOrder.rawPayload);
    const syncedOrder = {
      ...refreshedOrder,
      completedAt: normalized?.completedAt || null,
      customerName: readCustomerNameFromRawPayload(refreshedOrder.rawPayload),
      customerPhone: readCustomerPhoneFromRawPayload(refreshedOrder.rawPayload),
      customerMaskedPhone: readCustomerMaskedPhoneFromRawPayload(refreshedOrder.rawPayload),
      customerPhoneExtension: readCustomerPhoneExtensionFromRawPayload(refreshedOrder.rawPayload),
      delivery: refreshedOrder.delivery && typeof refreshedOrder.delivery === "object"
        ? {
            ...(refreshedOrder.delivery as Record<string, unknown>),
            riderPhone: readRiderPhoneFromDelivery(refreshedOrder.delivery) || readRiderPhoneFromRawPayload(refreshedOrder.rawPayload) || undefined,
          }
        : refreshedOrder.delivery,
    };

    return NextResponse.json({
      ok: true,
      id: refreshedOrder.id,
      orderNo: refreshedOrder.orderNo,
      platform: refreshedOrder.platform,
      status: refreshedOrder.status,
      completedAt: normalized?.completedAt || null,
      lastSyncedAt: refreshedOrder.lastSyncedAt,
      backfilled: backfill.count,
      order: syncedOrder,
    });
  } catch (error) {
    console.error("Failed to sync auto-pick order:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to sync order",
    }, { status: 500 });
  }
}
