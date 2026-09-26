export function readConfirmedRefundAmountFromRawPayload(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return 0;
  const record = rawPayload as Record<string, unknown>;
  const directAmount = Math.max(0, Number(record.refundAmount || record.refund_amount || 0) || 0);
  const cancelDetails = Array.isArray(record.cancelDetails || record.cancel_details)
    ? (record.cancelDetails || record.cancel_details) as Array<Record<string, unknown>>
    : [];
  const confirmedCancel = cancelDetails
    .filter((item) => String(item.status ?? "").trim() === "1")
    .pop();
  const confirmedAmountYuan = Math.max(0, Number(confirmedCancel?.total_price || 0) || 0);

  return Math.max(directAmount, Math.round(confirmedAmountYuan * 100));
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
