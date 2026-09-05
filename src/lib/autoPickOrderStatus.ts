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

  // 1. 检查是否有骑手姓名
  const riderNameCandidates = [
    orderDelivery.riderName,
    orderDelivery.rider_name,
    orderDelivery.delivery_name,
    orderDelivery.dispatcher_name,
    rawPayloadDelivery.riderName,
    rawPayloadDelivery.rider_name,
    rawPayloadDelivery.delivery_name,
    rawPayloadDelivery.dispatcher_name,
  ];
  if (riderNameCandidates.some((item) => String(item || "").trim().length > 0)) {
    return true;
  }

  // 2. 检查是否有骑手电话
  const riderPhoneCandidates = [
    orderDelivery.riderPhone,
    orderDelivery.rider_phone,
    orderDelivery.dispatcher_mobile,
    orderDelivery.delivery_phone,
    rawPayloadDelivery.riderPhone,
    rawPayloadDelivery.rider_phone,
    rawPayloadDelivery.dispatcher_mobile,
    rawPayloadDelivery.delivery_phone,
  ];
  if (riderPhoneCandidates.some((item) => String(item || "").trim().length > 0)) {
    return true;
  }

  // 3. 检查是否有取货时间（已取货则必然早已接单）
  const pickupTimeCandidates = [
    orderDelivery.pickupTime,
    orderDelivery.pickup_time,
    rawPayloadDelivery.pickupTime,
    rawPayloadDelivery.pickup_time,
  ];
  if (pickupTimeCandidates.some((item) => String(item || "").trim().length > 0)) {
    return true;
  }

  // 4. 检查配送与状态轨迹文本
  const textCandidates = [
    order.status,
    orderDelivery.track,
    orderDelivery.status,
    orderDelivery.delivery_status,
    orderDelivery.deliveryStatus,
    rawPayloadDelivery.track,
    rawPayloadDelivery.status,
    rawPayloadDelivery.delivery_status,
    rawPayloadDelivery.deliveryStatus,
    rawPayload.status,
    rawPayload.tips,
    rawPayload.orderStatus,
    rawPayload.order_status,
    rawPayload.deliveryStatus,
    rawPayload.delivery_status,
  ].map((item) => String(item || "").trim()).filter(Boolean);

  const riderAssignedRegex = /配送已接单|骑手已接单|待取货|骑手已到店|已到店|已取货|配送中|派送中/;
  const riderAssignedEnRegex = /^(pickup|delivering|assigned|accepted|accept)$/i;

  for (const text of textCandidates) {
    if (riderAssignedEnRegex.test(text)) {
      return true;
    }
    if (riderAssignedRegex.test(text)) {
      return true;
    }
    if (text.includes("已接单") && !/待接单|未接单/.test(text)) {
      return true;
    }
  }

  return false;
}
