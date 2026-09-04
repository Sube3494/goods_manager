import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import {
  backfillPersistedAutoPickOrderFields,
  backfillPlatformIdsForSyncedAutoPickOrder,
  clearAutoPickOrderMainSystemSelfDelivery,
  normalizeAutoPickOrderPayload,
  readCustomerMaskedPhoneFromRawPayload,
  readCustomerNameFromRawPayload,
  readCustomerPhoneExtensionFromRawPayload,
  readCustomerPhoneFromRawPayload,
  readCustomerTypeFromRawPayload,
  readRiderPhoneFromDelivery,
  readRiderPhoneFromRawPayload,
  refreshAutoPickOrderFromPlugin,
  resolveAutoPickCommandPlatform,
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
    const isAdmin = Boolean(
      session.role === "SUPER_ADMIN" ||
      (session.role && String(session.role).includes("管理")) ||
      (Array.isArray(session.permissions) && (session.permissions.includes("*") || session.permissions.includes("members:manage") || session.permissions.includes("admin")))
    );
    const order = await prisma.autoPickOrder.findFirst({
      where: {
        id,
        ...(isAdmin ? {} : { userId: session.id }),
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // 允许对订单执行同步刷新，以便从平台获取最新真实状态并自动恢复误取消的订单

    const refreshedOrder = await refreshAutoPickOrderFromPlugin(order.userId, {
      id: order.sourceId,
      platform: resolveAutoPickCommandPlatform(order),
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
      await syncBrushOrderFromCompletedAutoPickOrder(order.userId, refreshedOrder.id).catch((brushError) => {
        console.error("Failed to sync brush order after order sync:", brushError);
      });
      await syncAutoOutboundFromCompletedAutoPickOrder(order.userId, refreshedOrder.id).catch((outboundError) => {
        console.error("Failed to auto-create outbound after order sync:", outboundError);
      });
    }

    // 保护性逻辑：如果订单处于过渡态（例如刚发起自配 15 分钟内），不应因平台状态暂未变成“配送中”而误清空自配标记
    const currentSystemMeta = refreshedOrder.rawPayload && typeof refreshedOrder.rawPayload === "object" && !Array.isArray(refreshedOrder.rawPayload)
      ? (refreshedOrder.rawPayload as Record<string, unknown>).systemMeta as Record<string, unknown> | undefined
      : undefined;
    const selfDeliveryMeta = currentSystemMeta?.mainSystemSelfDelivery as { triggered?: boolean; triggeredAt?: string } | undefined;
    const isRecentlySelfDelivered = Boolean(
      selfDeliveryMeta?.triggered &&
      selfDeliveryMeta?.triggeredAt &&
      Date.now() - new Date(selfDeliveryMeta.triggeredAt).getTime() < 15 * 60 * 1000
    );

    if (
      !isRecentlySelfDelivered
      && !isAutoPickOrderDeliveringStatus(refreshedOrder.status)
      && !isAutoPickOrderCompletedStatus(refreshedOrder.status)
      && !isAutoPickOrderCancelledStatus(refreshedOrder.status)
      && !isAutoPickOrderAbnormalStatus(refreshedOrder.status)
    ) {
      await clearAutoPickOrderMainSystemSelfDelivery(order.userId, refreshedOrder.id, "sync-restored-non-self-delivery");
    }

    const backfill = await backfillPersistedAutoPickOrderFields(order.userId, {
      orderIds: [refreshedOrder.id],
    });
    const platformIdBackfill = await backfillPlatformIdsForSyncedAutoPickOrder(order.userId, refreshedOrder.id);

    const normalized = normalizeAutoPickOrderPayload(refreshedOrder.rawPayload);

    // 统一指标归一化（保留京东专属计算规则），保证单单同步返回的指标与列表接口完全一致
    const rawPlatform = String(refreshedOrder.platform || "").trim();
    const isOffline = rawPlatform === "线下交易" || rawPlatform === "other";
    const isJD = rawPlatform.includes("京东") || rawPlatform.toLowerCase().includes("jd") || rawPlatform.toLowerCase().includes("daojia");
    const actualPaidNum = Number(refreshedOrder.actualPaid || 0);
    const expectedIncomeNum = refreshedOrder.expectedIncome;

    let computedExpectedIncome = expectedIncomeNum;
    let computedPlatformCommission = Number(refreshedOrder.platformCommission || 0);

    if (isOffline) {
      computedExpectedIncome = Number.isFinite(Number(expectedIncomeNum)) && Number(expectedIncomeNum) > 0
        ? Math.round(Number(expectedIncomeNum))
        : (actualPaidNum > 0 ? Math.round(actualPaidNum) : (Number.isFinite(Number(expectedIncomeNum)) ? Math.round(Number(expectedIncomeNum)) : 0));
      computedPlatformCommission = 0;
    } else if (Number.isFinite(Number(expectedIncomeNum))) {
      computedExpectedIncome = Math.round(Number(expectedIncomeNum));
      const derivedCommission = Math.max(0, Math.round(actualPaidNum - computedExpectedIncome));
      computedPlatformCommission = Math.max(derivedCommission, Math.max(0, Math.round(Number(refreshedOrder.platformCommission || 0))));
    } else if (isJD) {
      const settledBase = Math.max(0, Math.round(actualPaidNum - 100));
      computedPlatformCommission = Math.max(0, Math.round(settledBase * 0.06));
      computedExpectedIncome = Math.max(0, settledBase - computedPlatformCommission);
    } else {
      computedPlatformCommission = Math.max(0, Math.round(Number(refreshedOrder.platformCommission || 0)));
    }

    const customerType = readCustomerTypeFromRawPayload(refreshedOrder.rawPayload)
      || normalized?.customerType
      || readCustomerTypeFromRawPayload(order.rawPayload)
      || null;

    const syncedOrder = {
      ...refreshedOrder,
      expectedIncome: computedExpectedIncome,
      platformCommission: computedPlatformCommission,
      completedAt: normalized?.completedAt || null,
      customerName: readCustomerNameFromRawPayload(refreshedOrder.rawPayload),
      customerPhone: readCustomerPhoneFromRawPayload(refreshedOrder.rawPayload),
      customerMaskedPhone: readCustomerMaskedPhoneFromRawPayload(refreshedOrder.rawPayload),
      customerPhoneExtension: readCustomerPhoneExtensionFromRawPayload(refreshedOrder.rawPayload),
      customerType,
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
      platformIdBackfilled: platformIdBackfill.count,
      platformIdBackfillDetails: platformIdBackfill.details,
      order: syncedOrder,
    });
  } catch (error) {
    console.error("Failed to sync auto-pick order:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to sync order",
    }, { status: 500 });
  }
}
