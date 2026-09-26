function readEffectiveConfirmedRefunds(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return [];
  const record = rawPayload as Record<string, unknown>;
  const cancelDetails = Array.isArray(record.cancelDetails || record.cancel_details)
    ? (record.cancelDetails || record.cancel_details) as Array<Record<string, unknown>>
    : [];
  if (cancelDetails.length === 0) return [];

  const latestByRefundRequest = new Map<string, Record<string, unknown>>();
  cancelDetails.forEach((item, index) => {
    const requestId = String(item.source_cancel_id || item.sourceCancelId || "").trim();
    latestByRefundRequest.set(requestId || `record:${index}`, item);
  });

  return [...latestByRefundRequest.values()].filter((item) => {
    const status = String(item.status ?? "").trim();
    const title = String(item.title || "").trim();
    return status === "1"
      && /确认退款|同意退款|退款成功|退款完成|已退款/.test(title)
      && !/取消|拒绝|驳回/.test(title);
  });
}

export function hasEffectiveConfirmedRefund(rawPayload: unknown) {
  return readEffectiveConfirmedRefunds(rawPayload).length > 0;
}

export function readConfirmedRefundAmountFromRawPayload(rawPayload: unknown) {
  return readEffectiveConfirmedRefunds(rawPayload).reduce((sum, item) => (
    sum + Math.round(Math.max(0, Number(item.total_price || 0) || 0) * 100)
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
  const returnedRefundAmount = options.hasReturnedGoods && hasConfirmedRefund
    ? (platformRefundAmount > 0
        ? platformRefundAmount
        : Math.max(0, Number(options.actualPaid || 0) || 0))
    : 0;

  return Math.max(recordedRefundAmount, directRefundAmount, returnedRefundAmount);
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

export function resolveCancelledOrderPureProfit(deliveryFeeLoss: unknown, returnExtraExpense: unknown) {
  const totalLoss = Math.max(0, Number(deliveryFeeLoss || 0))
    + Math.max(0, Number(returnExtraExpense || 0));
  return totalLoss > 0 ? -totalLoss : null;
}
