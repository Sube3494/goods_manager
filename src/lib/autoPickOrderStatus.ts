export const AUTO_PICK_EXTRA_STATUS_FILTERS = [
  { value: "pending-outbound", label: "未出库" },
  { value: "pending-backfill", label: "未回填" },
] as const;

export function isAutoPickExtraStatusFilter(status?: string | null) {
  const value = String(status || "").trim();
  return AUTO_PICK_EXTRA_STATUS_FILTERS.some((item) => item.value === value);
}

export function getAutoPickStatusFilterLabel(status?: string | null) {
  const value = String(status || "").trim();
  const matched = AUTO_PICK_EXTRA_STATUS_FILTERS.find((item) => item.value === value);
  if (matched) {
    return matched.label;
  }
  return getBaseAutoPickStatusDisplay(status);
}

export function matchesAutoPickStatusFilter(
  order: { status?: string | null; productCostStatus?: "ready" | "pending-outbound" | "pending-backfill" | null },
  filter?: string | null
) {
  const value = String(filter || "").trim();
  if (!value || value === "all") {
    return true;
  }
  if (value === "pending-outbound") {
    return order.productCostStatus === "pending-outbound";
  }
  if (value === "pending-backfill") {
    return order.productCostStatus === "pending-backfill";
  }
  return getBaseAutoPickStatusDisplay(order.status) === getBaseAutoPickStatusDisplay(value);
}

export function getBaseAutoPickStatusDisplay(status?: string | null) {
  const text = String(status || "").trim();
  const normalized = text.toLowerCase();

  if (!text) return "同步中";

  if (
    text.includes("删除")
    || normalized === "delete"
    || normalized === "deleted"
  ) {
    return "已删除";
  }

  if (
    text.includes("已完成")
    || text.includes("订单完成")
    || text.includes("配送完成")
    || text.includes("已送达")
    || normalized === "done"
    || normalized === "completed"
    || normalized === "complete"
    || normalized === "finished"
    || normalized === "finish"
  ) {
    return "已完成";
  }

  if (
    text.includes("取消")
    || text === "已退款"
    || text === "全额退款"
    || text === "退款成功"
    || text.includes("已关闭")
    || normalized === "cancel"
    || normalized === "cancelled"
    || normalized === "canceled"
    || normalized === "closed"
  ) {
    return "已取消";
  }

  if (text.includes("配送中") || text.includes("派送中") || normalized === "delivering") {
    return "配送中";
  }

  if (normalized === "expect" || text.includes("expect")) {
    return "异常";
  }

  if (text.includes("已拣货") || text.includes("拣货中")) {
    return "已拣货";
  }

  if (
    text.includes("待配送")
    || text.includes("配送已下单")
    || text.includes("配送已接单")
    || text.includes("骑手已到店")
    || text.includes("待发货")
    || text.includes("待送达")
    || text.includes("待骑手")
    || text.includes("立即送达")
    || text.includes("尽快送达")
    || text.includes("立即配送")
    || text.includes("商家自配")
    || normalized === "delivery"
    || normalized === "pickup"
    || normalized === "pending_delivery"
    || normalized === "pendingdelivery"
  ) {
    return "待配送";
  }

  if (
    text.includes("待处理")
    || text.includes("新订单")
    || text.includes("待接单")
    || text.includes("商家处理中")
    || normalized === "confirm"
    || normalized === "pending"
    || normalized === "processing"
  ) {
    return "待处理";
  }

  return text.split(/[,，]/)[0].trim() || "同步中";
}

export function isAutoPickOrderCompletedStatus(status?: string | null) {
  return getBaseAutoPickStatusDisplay(status) === "已完成";
}

export function isAutoPickOrderCancelledStatus(status?: string | null) {
  return getBaseAutoPickStatusDisplay(status) === "已取消";
}

export function isAutoPickOrderDeletedStatus(status?: string | null) {
  return getBaseAutoPickStatusDisplay(status) === "已删除";
}

export function isAutoPickOrderAbnormalStatus(status?: string | null) {
  return getBaseAutoPickStatusDisplay(status) === "异常";
}

export function isAutoPickOrderTerminalStatus(status?: string | null) {
  const display = getBaseAutoPickStatusDisplay(status);
  return display === "已完成" || display === "已取消" || display === "已删除";
}

export function isAutoPickOrderDeliveringStatus(status?: string | null) {
  return getBaseAutoPickStatusDisplay(status) === "配送中";
}

export function hasAutoPickCompletionProof(rawPayload: unknown, deliveryValue?: unknown) {
  const record = rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
    ? rawPayload as Record<string, unknown>
    : {};
  const rawDelivery = deliveryValue || record.delivery;
  const delivery = rawDelivery && typeof rawDelivery === "object" && !Array.isArray(rawDelivery)
    ? rawDelivery as Record<string, unknown>
    : {};
  const completionText = [
    record.status,
    record.tips,
    record.orderStatus,
    record.order_status,
    record.deliveryStatus,
    record.delivery_status,
    delivery.track,
    delivery.status,
  ].map((item) => String(item || "").trim()).filter(Boolean).join(" ");

  return Boolean(
    record.completedAt
    || record.finishedTime
    || record.finished_time
    || delivery.completedTime
    || delivery.completed_time
    || /订单完成|已完成|配送完成|已送达/.test(completionText)
  );
}

export function doesAutoPickOrderRequirePickConfirmation(platform?: string | null) {
  const normalized = String(platform || "").trim().toLowerCase();
  return normalized.includes("美团")
    || normalized.includes("meituan")
    || normalized.includes("淘宝")
    || normalized.includes("taobao");
}

export function isAutoPickPickCompleted(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return false;
  }

  const record = rawPayload as Record<string, unknown>;
  const pickProgress = record.pickProgress;
  if (!pickProgress || typeof pickProgress !== "object" || Array.isArray(pickProgress)) {
    return false;
  }

  return Boolean((pickProgress as Record<string, unknown>).pickCompleted);
}

export function isAutoPickSelfDeliveryStarted(order: {
  status?: string | null;
  rawPayload?: unknown;
  delivery?: unknown;
}) {
  if (isAutoPickOrderDeliveringStatus(order.status)) {
    return true;
  }

  const rawPayload = order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)
    ? order.rawPayload as Record<string, unknown>
    : {};
  const systemMeta = rawPayload.systemMeta && typeof rawPayload.systemMeta === "object" && !Array.isArray(rawPayload.systemMeta)
    ? rawPayload.systemMeta as Record<string, unknown>
    : {};
  const mainSystemSelfDelivery = systemMeta.mainSystemSelfDelivery && typeof systemMeta.mainSystemSelfDelivery === "object" && !Array.isArray(systemMeta.mainSystemSelfDelivery)
    ? systemMeta.mainSystemSelfDelivery as Record<string, unknown>
    : null;
  if (mainSystemSelfDelivery?.triggered) {
    return true;
  }

  const delivery = order.delivery && typeof order.delivery === "object" && !Array.isArray(order.delivery)
    ? order.delivery as Record<string, unknown>
    : {};

  const statusCandidates = [
    order.status,
    rawPayload.status,
    rawPayload.tips,
    rawPayload.delivery_status,
    rawPayload.deliveryStatus,
    rawPayload.logisticTag,
    rawPayload.logistic_tag,
    rawPayload.logisticName,
    rawPayload.logistic_name,
    delivery.logisticName,
    delivery.logistic_name,
    delivery.track,
  ];

  return statusCandidates.some((item) => /自配|商家自配|oneself/i.test(String(item || "").trim()));
}

export function isAutoPickPickupOrder(
  rawPayload: unknown,
  userAddress?: string | null,
  shopAddress?: string | null,
) {
  const candidates = [userAddress, shopAddress];
  let matchesImplicitPickup = false;

  if (rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)) {
    const record = rawPayload as Record<string, unknown>;
    const delivery = record.delivery && typeof record.delivery === "object" && !Array.isArray(record.delivery)
      ? record.delivery as Record<string, unknown>
      : {};
    const extend = record.extend && typeof record.extend === "object" && !Array.isArray(record.extend)
      ? record.extend as Record<string, unknown>
      : {};
    const channelTag = String(record.channelTag || record.channel_tag || "").trim().toLowerCase();
    const addressText = [
      userAddress,
      record.unencrypted_map_address,
      record.unencrypted_address,
      record.map_address,
      record.address,
    ].map((item) => String(item || "").trim()).join("");
    const hasDeliveryObject = Boolean(record.delivery && typeof record.delivery === "object" && !Array.isArray(record.delivery));
    const deliveryDistance = Number(record.delivery_distance || record.riding_distance || 0);
    const deliveryId = String(record.delivery_id || "").trim();

    matchesImplicitPickup =
      channelTag === "other"
      && !hasDeliveryObject
      && (deliveryId === "" || deliveryId === "0")
      && (!Number.isFinite(deliveryDistance) || deliveryDistance <= 0)
      && !addressText;

    candidates.push(
      String(record.shopAddress || ""),
      String(record.rawShopAddress || ""),
      String(record.shop_address_detail || ""),
      String(record.raw_shop_address || ""),
      String(record.shop_address || ""),
      String(record.storeAddress || ""),
      String(record.store_address || ""),
      String(record.merchantAddress || ""),
      String(record.merchant_address || ""),
      String(record.channel_address || ""),
      String(record.channelAddress || ""),
      String(extend.channel_address || ""),
      String(extend.channelAddress || ""),
      String(extend.store_address || ""),
      String(extend.storeAddress || ""),
      String(extend.merchant_address || ""),
      String(extend.merchantAddress || ""),
      String(record.status || ""),
      String(record.tips || ""),
      String(record.deliveryTimeRange || ""),
      String(record.delivery_time_range || ""),
      String(record.delivery_time_format || ""),
      String(record.deliveryTypeName || ""),
      String(record.delivery_type_name || ""),
      String(record.fulfilmentTypeName || ""),
      String(record.fulfilment_type_name || ""),
      String(record.unencrypted_map_address || ""),
      String(record.unencrypted_address || ""),
      String(record.user_remark || ""),
      String(record.address || ""),
      String(record.map_address || ""),
      String(record.deliveryType || ""),
      String(record.delivery_type || ""),
      String(record.fulfilmentType || ""),
      String(record.fulfilment_type || ""),
      String(delivery.pickupTime || ""),
      String(delivery.pickup_time || ""),
      String(delivery.track || ""),
      String(delivery.logisticName || ""),
      String(delivery.logistic_name || "")
    );
  }

  return matchesImplicitPickup
    || candidates.some((item) => /到店自取|门店自取|上门自取|线下自提|到店取货|待取货|取货时间|自提/.test(String(item || "").trim()));
}

export function isAutoPickOtherPickupOrder(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return false;
  }

  const record = rawPayload as Record<string, unknown>;
  const channelTag = String(record.channelTag || record.channel_tag || "").trim().toLowerCase();
  return channelTag === "other";
}

export function resolveAutoPickBusinessStatus(
  status: string | null | undefined,
  rawPayload: unknown,
  userAddress?: string | null,
  shopAddress?: string | null,
) {
  const baseStatus = getBaseAutoPickStatusDisplay(status);

  if (isAutoPickPickCompleted(rawPayload) && (baseStatus === "同步中" || baseStatus === "待处理")) {
    return "已拣货";
  }

  if (isAutoPickOtherPickupOrder(rawPayload) && !isAutoPickPickupOrder(rawPayload, userAddress, shopAddress)) {
    if (baseStatus === "同步中" || baseStatus === "待处理" || baseStatus === "已拣货") {
      return "待配送";
    }
  }

  return String(status || "").trim() || undefined;
}

export function isAutoPickOrderRiderAssigned(order?: {
  status?: string | null;
  rawPayload?: unknown;
  delivery?: unknown;
} | null) {
  if (!order) return false;

  const rawPayload = order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)
    ? order.rawPayload as Record<string, unknown>
    : {};
  const rawPayloadDelivery = rawPayload.delivery && typeof rawPayload.delivery === "object" && !Array.isArray(rawPayload.delivery)
    ? rawPayload.delivery as Record<string, unknown>
    : {};
  const orderDelivery = order.delivery && typeof order.delivery === "object" && !Array.isArray(order.delivery)
    ? order.delivery as Record<string, unknown>
    : {};

  // 1. 检查配送运单是否已取消或已退单（包含 cancel_time、取消状态码 99、或 track 含“取消/退单”）
  const cancelTime = rawPayloadDelivery.cancel_time ?? rawPayloadDelivery.cancelTime ?? orderDelivery.cancelTime;
  const isCancelledByTime = cancelTime && cancelTime !== "0" && cancelTime !== 0;

  const deliveryStatusCandidates = [
    orderDelivery.status,
    orderDelivery.delivery_status,
    orderDelivery.deliveryStatus,
    rawPayloadDelivery.status,
    rawPayloadDelivery.delivery_status,
    rawPayloadDelivery.deliveryStatus,
  ].map((s) => String(s || "").trim().toLowerCase());
  const isCancelledByStatus = deliveryStatusCandidates.some((s) => s === "99" || s === "cancel" || s === "cancelled" || s === "canceled");

  const trackCandidates = [
    orderDelivery.track,
    rawPayloadDelivery.track,
  ].map((item) => String(item || "").trim()).filter(Boolean);

  const isCancelledByTrack = trackCandidates.some((text) => /取消|退单|失效/.test(text));
  const isPendingRiderByTrack = trackCandidates.some((text) => /待接单|未接单|待呼叫|呼叫中|未呼叫/.test(text));

  // 核心：若配送已取消、已退单，或当前处于重新呼叫/等待接单阶段，则骑手并未在有效履约，绝不限制自配！
  if (isCancelledByTime || isCancelledByStatus || isCancelledByTrack || isPendingRiderByTrack) {
    return false;
  }

  // 2. 检查运单轨迹是否明确处于生效中的骑手接单/到店状态
  const isRiderAssignedByTrack = trackCandidates.some((text) => /骑手已接单|配送已接单|骑手已到店|待取货/.test(text));
  if (isRiderAssignedByTrack) {
    return true;
  }

  // 3. 检查是否有真实的第三方骑手姓名（排除自配送）
  const riderNameCandidates = [
    orderDelivery.riderName,
    orderDelivery.rider_name,
    orderDelivery.delivery_name,
    orderDelivery.dispatcher_name,
    rawPayloadDelivery.riderName,
    rawPayloadDelivery.rider_name,
    rawPayloadDelivery.delivery_name,
    rawPayloadDelivery.dispatcher_name,
  ].map((item) => String(item || "").trim()).filter(Boolean);

  const hasThirdPartyRiderName = riderNameCandidates.some((name) => !/自配|自配送|商家自配|oneself/i.test(name));

  // 4. 关键：当订单不在配送状态时，不能仅凭历史残留的配送员信息判定为接单！
  // 只有当订单或运单明确属于“配送中/派送中”，且存在第三方配送员时，才视为骑手接单
  const isOrderDelivering = isAutoPickOrderDeliveringStatus(order.status)
    || trackCandidates.some((text) => /配送中|派送中/.test(text));

  if (hasThirdPartyRiderName && isOrderDelivering) {
    return true;
  }

  return false;
}

export function isSelfDeliveryOrCancelledDelivery(delivery: unknown, rawPayloadOrFlag?: unknown): boolean {
  if (delivery && typeof delivery === "object" && !Array.isArray(delivery)) {
    const d = delivery as Record<string, unknown>;
    const logisticName = String(d.logisticName || d.logistic_name || "").trim();
    const riderName = String(d.riderName || d.delivery_name || "").trim();
    const track = String(d.track || "").trim();

    // 取消或退单
    if (/取消|退单/.test(track)) return true;
    if (d.cancel_time != null || d.cancelTime != null) return true;

    // 显式标注自配送
    if (/自配|自配送|商家自配|oneself/i.test(logisticName)) return true;
    if (/自配|自配送|商家自配/i.test(riderName)) return true;

    // 关键防御：如果订单已有明确的第三方物流运力（如货拉拉、顺丰、美团、达达等），客观上并非自配
    const hasThirdPartyLogistic = Boolean(logisticName && !/自配|自配送|商家自配|oneself/i.test(logisticName));
    if (hasThirdPartyLogistic) {
      return false;
    }
  }

  if (rawPayloadOrFlag === true) return true;
  if (rawPayloadOrFlag && typeof rawPayloadOrFlag === "object" && !Array.isArray(rawPayloadOrFlag)) {
    const raw = rawPayloadOrFlag as Record<string, unknown>;
    const systemMeta = raw.systemMeta && typeof raw.systemMeta === "object" && !Array.isArray(raw.systemMeta)
      ? raw.systemMeta as Record<string, unknown>
      : null;
    if (systemMeta?.isSelfDelivery === true || systemMeta?.isMainSystemSelfDelivery === true || raw.isMainSystemSelfDelivery === true) {
      return true;
    }
  }

  return false;
}

export function readDeliveryFeeFromValue(delivery: unknown, rawPayloadOrFlag?: unknown) {
  if (isSelfDeliveryOrCancelledDelivery(delivery, rawPayloadOrFlag)) {
    return 0;
  }
  if (!delivery || typeof delivery !== "object" || Array.isArray(delivery)) {
    return 0;
  }
  const d = delivery as Record<string, unknown>;
  const rawFee = d.sendFee ?? d.send_fee ?? d.delivery_fee ?? d.fee;
  const num = Number(rawFee ?? 0);
  if (!Number.isFinite(num) || num <= 0) {
    return 0;
  }
  // 若带小数点（如 23.62 元）或小数，自动转换为分单位
  if (String(rawFee).includes(".") || (num < 100 && !Number.isInteger(num))) {
    return Math.round(num * 100);
  }
  return Math.round(num);
}

export function readMainSystemSelfDeliveryFlag(rawPayload: unknown, delivery?: unknown): boolean {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return false;
  }

  const systemMeta = (rawPayload as Record<string, unknown>).systemMeta;
  if (!systemMeta || typeof systemMeta !== "object" || Array.isArray(systemMeta)) {
    return false;
  }

  const marker = (systemMeta as Record<string, unknown>).mainSystemSelfDelivery;
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) {
    return false;
  }

  const triggered = Boolean((marker as Record<string, unknown>).triggered);
  if (!triggered) {
    return false;
  }

  if (delivery && typeof delivery === "object" && !Array.isArray(delivery)) {
    const d = delivery as Record<string, unknown>;
    const logisticName = String(d.logisticName || d.logistic_name || "").trim();
    const hasThirdPartyLogistic = Boolean(logisticName && !/自配|自配送|商家自配|oneself/i.test(logisticName));
    const triggeredAt = (marker as Record<string, unknown>).triggeredAt;
    const isRecent = Boolean(triggeredAt && (Date.now() - new Date(String(triggeredAt)).getTime() < 15 * 60 * 1000));
    const hasDispatcher = Boolean(d.dispatcher);

    // 只有在非近期发起的自配，或者已有明确的新骑手（dispatcher）接单时，第三方跑腿才能覆盖商家自配标记
    if (hasThirdPartyLogistic && (!isRecent || hasDispatcher)) {
      return false;
    }
  }

  return true;
}

