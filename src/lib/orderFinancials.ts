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

export function hasExplicitDeliveryPickupProof(delivery: unknown, rawPayload?: unknown) {
  const deliveryObj = delivery && typeof delivery === "object" && !Array.isArray(delivery)
    ? delivery as Record<string, unknown>
    : {};
  const rawObj = rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
    ? rawPayload as Record<string, unknown>
    : {};
  const rawDelivery = rawObj.delivery && typeof rawObj.delivery === "object" && !Array.isArray(rawObj.delivery)
    ? rawObj.delivery as Record<string, unknown>
    : {};
  const pickupTime = [
    rawObj.pickup_time,
    rawObj.pickupTime,
    rawObj.picker_time,
    rawObj.pickerTime,
    rawDelivery.pickup_time,
    rawDelivery.pickupTime,
    rawDelivery.picker_time,
    rawDelivery.pickerTime,
    rawDelivery.pick_time,
    rawDelivery.pickTime,
  ].map((value) => String(value || "").trim()).find((value) => value && value !== "0");
  const track = String(deliveryObj.track || "").trim();
  const completedTime = String(deliveryObj.completedTime || deliveryObj.completed_time || "").trim();

  return Boolean(pickupTime || completedTime)
    || /已取货|已取餐|取货完成|取餐完成|已送达|配送完成/.test(track);
}

export function resolveCancelledOrderPureProfit(deliveryFeeLoss: unknown, returnExtraExpense: unknown) {
  const totalLoss = Math.max(0, Number(deliveryFeeLoss || 0))
    + Math.max(0, Number(returnExtraExpense || 0));
  return totalLoss > 0 ? -totalLoss : null;
}
