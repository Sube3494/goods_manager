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
    text.includes("取消")
    || text.includes("退款")
    || text.includes("关闭")
    || normalized === "cancel"
    || normalized === "cancelled"
    || normalized === "canceled"
    || normalized === "closed"
    || normalized === "refund"
  ) {
    return "已取消";
  }

  if (
    text.includes("已完成")
    || text.includes("配送完成")
    || normalized === "done"
    || normalized === "completed"
    || normalized === "complete"
    || normalized === "finished"
    || normalized === "finish"
  ) {
    return "已完成";
  }

  if (text.includes("配送中") || normalized === "delivering") {
    return "配送中";
  }

  if (normalized === "expect" || text.includes("expect")) {
    return "异常";
  }

  if (
    text.includes("待配送")
    || text.includes("待发货")
    || text.includes("待送达")
    || text.includes("待骑手")
    || text.includes("立即送达")
    || text.includes("尽快送达")
    || text.includes("立即配送")
    || text.includes("商家自配")
    || normalized === "pending_delivery"
    || normalized === "pendingdelivery"
  ) {
    return "待配送";
  }

  if (text.includes("已拣货") || text.includes("拣货中")) {
    return "已拣货";
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

export function isAutoPickPickupOrder(rawPayload: unknown, userAddress?: string | null) {
  const candidates = [userAddress];

  if (rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)) {
    const record = rawPayload as Record<string, unknown>;
    candidates.push(
      String(record.shopAddress || ""),
      String(record.rawShopAddress || ""),
      String(record.shop_address || ""),
      String(record.store_address || ""),
      String(record.merchant_address || ""),
      String(record.unencrypted_map_address || ""),
      String(record.unencrypted_address || ""),
      String(record.user_remark || ""),
      String(record.address || ""),
      String(record.map_address || ""),
      String(record.deliveryType || ""),
      String(record.delivery_type || ""),
      String(record.fulfilmentType || ""),
      String(record.fulfilment_type || "")
    );
  }

  return candidates.some((item) => /到店自取|门店自取|上门自取|线下自提|自提/.test(String(item || "").trim()));
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
) {
  const baseStatus = getBaseAutoPickStatusDisplay(status);

  if (isAutoPickOtherPickupOrder(rawPayload) && !isAutoPickPickupOrder(rawPayload, userAddress)) {
    if (baseStatus === "同步中" || baseStatus === "待处理" || baseStatus === "已拣货") {
      return "待配送";
    }
  }

  return String(status || "").trim() || undefined;
}
