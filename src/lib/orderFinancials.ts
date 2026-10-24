export function readEffectiveConfirmedRefunds(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return [];
  const record = rawPayload as Record<string, unknown>;
  const cancelDetails = Array.isArray(record.cancelDetails || record.cancel_details)
    ? (record.cancelDetails || record.cancel_details) as Array<Record<string, unknown>>
    : [];
  if (cancelDetails.length === 0) return [];

  const latestByRefundRequest = new Map<string, Record<string, unknown>>();
  cancelDetails.forEach((item) => {
    const requestId = String(item.source_cancel_id || item.sourceCancelId || "").trim();
    const key = requestId || "unknown-request";
    const previous = latestByRefundRequest.get(key);
    if (previous && /^\d+$/.test(String(previous.id || "")) && /^\d+$/.test(String(item.id || ""))
      && BigInt(String(previous.id)) > BigInt(String(item.id))) return;
    latestByRefundRequest.set(key, item);
  });

  return [...latestByRefundRequest.values()].filter((item) => {
    const status = String(item.status ?? "").trim();
    const title = String(item.title || "").trim();
    return status === "1"
      && !/取消退款申请|撤销退款|拒绝|驳回/.test(title);
  });
}

export function hasEffectiveConfirmedRefund(rawPayload: unknown) {
  return readEffectiveConfirmedRefunds(rawPayload).length > 0;
}

export function hasOrderRefundState(order: {
  rawPayload?: unknown;
  refundAmount?: unknown;
  status?: string | null;
}) {
  if (hasEffectiveConfirmedRefund(order.rawPayload)) return true;
  if (Number(order.refundAmount || 0) > 0) return true;
  const raw = order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)
    ? order.rawPayload as Record<string, unknown>
    : {};
  if (Number(raw.refundAmount || raw.refund_amount || 0) > 0) return true;
  return /已退款|退款成功|全额退款|全部退款|部分退款/.test(String(order.status || ""));
}

export function readConfirmedRefundAmountFromRawPayload(rawPayload: unknown) {
  return readEffectiveConfirmedRefunds(rawPayload).reduce((total, item) => (
    total + Math.round(Math.max(0, Number(item.total_price || 0) || 0) * 100)
  ), 0);
}

function readDirectRefundAmountWithoutMaiyatianDetails(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return 0;
  const record = rawPayload as Record<string, unknown>;
  const cancelDetails = Array.isArray(record.cancelDetails || record.cancel_details)
    ? (record.cancelDetails || record.cancel_details) as Array<Record<string, unknown>>
    : [];
  // 存在麦芽田取消详情时，不信任历史同步残留的 rawPayload.refundAmount。
  // 平台 total_price 由确认退款 + 商品已退的组合规则单独处理。
  if (cancelDetails.length > 0) return 0;
  return Math.max(0, Number(record.refundAmount || record.refund_amount || 0) || 0);
}

export function resolveOrderRefundAmount(options: {
  rawPayload: unknown;
  actualPaid: unknown;
  recordedRefundAmount?: unknown;
  hasReturnedGoods?: boolean;
}) {
  const recordedRefundAmount = Math.max(0, Number(options.recordedRefundAmount || 0) || 0);
  const directRefundAmount = readDirectRefundAmountWithoutMaiyatianDetails(options.rawPayload);
  const hasConfirmedRefund = hasEffectiveConfirmedRefund(options.rawPayload);
  const platformRefundAmount = readConfirmedRefundAmountFromRawPayload(options.rawPayload);
  // 确认退款的金额独立于本地是否已经做退货入库。
  const returnedRefundAmount = platformRefundAmount > 0
    ? platformRefundAmount
    : options.hasReturnedGoods && hasConfirmedRefund
      ? Math.max(0, Number(options.actualPaid || 0) || 0)
      : 0;

  return Math.max(recordedRefundAmount, directRefundAmount, returnedRefundAmount);
}

// 美团退款后按剩余实付和固定 6% 佣金重算，包括历史上曾手动修改的订单。
export function resolveRefundAdjustedIncomeMetrics(options: {
  expectedIncome: number | null | undefined;
  platformCommission: number | null | undefined;
  actualPaid: number | null | undefined;
  refundAmount: number | null | undefined;
  platform?: string | null;
  // 以分传入时为 1，以元传入时为 100，统一精确到分。
  amountScale?: 1 | 100;
}) {
  const actualPaid = Math.max(0, Number(options.actualPaid || 0));
  const refundAmount = Math.max(0, Number(options.refundAmount || 0));
  const remainingPaid = Math.max(0, actualPaid - refundAmount);
  const shouldRecalculate = refundAmount > 0
    && /美团|meituan|shangou/i.test(String(options.platform || ""));
  const scale = options.amountScale || 1;
  const commission = shouldRecalculate
    ? Math.round(remainingPaid * 0.06 * scale) / scale
    : Number(options.platformCommission || 0);
  const expectedIncome = shouldRecalculate
    ? Math.round((remainingPaid - commission) * scale) / scale
    : Math.max(0, Number(options.expectedIncome || 0));
  return {
    actualPaid: remainingPaid,
    expectedIncome,
    platformCommission: commission,
    refundedExpectedIncome: 0,
    refundedCommission: 0,
  };
}

export function hasExplicitDeliveryPickupProof(delivery: unknown, _rawPayload?: unknown) {
  const deliveryObj = delivery && typeof delivery === "object" && !Array.isArray(delivery)
    ? delivery as Record<string, unknown>
    : {};
  const track = String(deliveryObj.track || "").trim();
  const completedTime = String(deliveryObj.completedTime || deliveryObj.completed_time || "").trim();

  // 麦芽田的 pickup_time/“取餐时间”是计划时间，并不代表骑手已经取货。
  // 只认履约轨迹已经进入取货后的阶段，或存在明确完成时间。
  return Boolean(completedTime)
    || /已取货|已取餐|取货完成|取餐完成|配送中|派送中|已送达|配送完成/.test(track);
}

export function isJDPlatformOrder(platform?: unknown, rawPayload?: unknown): boolean {
  const p = String(platform || "").trim().toLowerCase();
  if (p === "京东" || p === "jd" || p.includes("jingdong") || p.includes("jddj") || p.includes("京东")) {
    return true;
  }
  if (rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)) {
    const raw = rawPayload as Record<string, unknown>;
    const channelTag = String(raw.channel_tag || raw.channelTag || raw.goods_channel_tag || raw.source_tag || "").toLowerCase();
    if (channelTag === "daojia" || channelTag.includes("jd") || channelTag.includes("jingdong")) {
      return true;
    }
  }
  return false;
}

export function hasOrderDeliveredProof(delivery?: unknown, rawPayload?: unknown, completedAt?: unknown): boolean {
  const hasTime = (value: unknown) => Boolean(value) && !["", "0"].includes(String(value).trim());
  if (hasTime(completedAt)) return true;
  const deliveryObj = delivery && typeof delivery === "object" && !Array.isArray(delivery)
    ? delivery as Record<string, unknown>
    : {};
  const rawObj = rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
    ? rawPayload as Record<string, unknown>
    : {};

  const rawDelivery = rawObj.delivery && typeof rawObj.delivery === "object" && !Array.isArray(rawObj.delivery)
    ? rawObj.delivery as Record<string, unknown> : {};
  if ([deliveryObj, rawDelivery, rawObj].some((value) =>
    [value.completedTime, value.completed_time, value.finished_time, value.finishedTime].some(hasTime)
  )) return true;

  const track = String(deliveryObj.track || rawObj.track || "").trim();
  const statusText = [
    track,
    deliveryObj.status,
    rawDelivery.track,
    rawDelivery.status,
    rawObj.status,
    rawObj.orderStatus,
    rawObj.order_status,
    rawObj.deliveryStatus,
    rawObj.delivery_status,
    rawObj.tips,
  ].map((item) => String(item || "").trim()).filter(Boolean).join(" ");

  return /配送完成|已送达|用户已收货|订单完成|已完成/.test(statusText);
}

export function resolveCancelledJDDeliveredCommissionLoss(order: {
  platform?: unknown;
  delivery?: unknown;
  rawPayload?: unknown;
  completedAt?: unknown;
  platformCommission?: unknown;
  actualPaid?: unknown;
  expectedIncome?: unknown;
}): number {
  if (!isJDPlatformOrder(order.platform, order.rawPayload)) {
    return 0;
  }
  if (!hasOrderDeliveredProof(order.delivery, order.rawPayload, order.completedAt)) {
    return 0;
  }
  const explicitCommission = Math.round(Number(order.platformCommission || 0));
  if (explicitCommission > 0) {
    return explicitCommission;
  }
  const actualPaid = Math.max(0, Number(order.actualPaid || 0));
  const expectedIncome = Math.max(0, Number(order.expectedIncome || 0));
  if (actualPaid > 0 && expectedIncome > 0 && actualPaid > expectedIncome) {
    return Math.round(actualPaid - expectedIncome);
  }
  return 0;
}

export function resolveCancelledOrderPureProfit(
  deliveryFeeLoss: unknown,
  returnExtraExpense: unknown,
  platformCommissionLoss?: unknown,
) {
  const delivery = Math.max(0, Number(deliveryFeeLoss || 0));
  const expense = Number(returnExtraExpense || 0);
  const commission = Math.max(0, Number(platformCommissionLoss || 0));
  const netExpense = delivery + expense + commission;
  return netExpense !== 0 ? -netExpense : null;
}
function isRefundableMeituanDelivery(delivery: unknown) {
  const deliveryObj = delivery && typeof delivery === "object" && !Array.isArray(delivery)
    ? delivery as Record<string, unknown>
    : {};
  const haystack = [
    deliveryObj.logisticName,
    deliveryObj.logistic_name,
    deliveryObj.track,
    deliveryObj.deliveryName,
    deliveryObj.delivery_name,
    deliveryObj.deliveryTypeName,
    deliveryObj.delivery_type_name,
  ].map((value) => String(value || "").trim().toLowerCase()).join(" ");
  return haystack.includes("美团") || haystack.includes("meituan");
}

export function hasRealizedCancelledDeliveryCost(input: {
  deliveryFee: number;
  completedAt?: unknown;
  platform?: unknown;
  delivery?: unknown;
  rawPayload?: unknown;
}) {
  const isOffline = String(input.platform || "").trim() === "线下交易" || String(input.platform || "").toLowerCase() === "other";
  if (isOffline) {
    return false;
  }
  const d = (input.delivery && typeof input.delivery === "object" && !Array.isArray(input.delivery)) ? input.delivery as Record<string, unknown> : {};
  const rawObj = (input.rawPayload && typeof input.rawPayload === "object" && !Array.isArray(input.rawPayload)) ? input.rawPayload as Record<string, unknown> : {};
  const systemMeta = (rawObj.systemMeta && typeof rawObj.systemMeta === "object" && !Array.isArray(rawObj.systemMeta)) ? rawObj.systemMeta as Record<string, unknown> : null;
  const hasManualFee = (typeof d.manualDeliveryFee === "number" && d.manualDeliveryFee >= 0)
    || (systemMeta?.manualDeliveryFee && typeof (systemMeta.manualDeliveryFee as any)?.deliveryFee === "number");
  if (hasManualFee) {
    return input.deliveryFee > 0;
  }
  // 送达后取消，配送服务已完成，配送费不会返还（含美团配送）。
  if (input.deliveryFee > 0 && hasOrderDeliveredProof(input.delivery, input.rawPayload, input.completedAt)) return true;
  return input.deliveryFee > 0
    && hasExplicitDeliveryPickupProof(input.delivery, input.rawPayload)
    && !isRefundableMeituanDelivery(input.delivery);
}

