import { formatLocalDate } from "./dateUtils";

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

export function isOrderFullyRefunded(order?: {
  actualPaid?: number | null;
  expectedIncome?: number | null;
  refundAmount?: number | null;
  status?: string | null;
  outboundMeta?: { isFullyReturned?: boolean } | null;
  outboundReturnDetails?: Array<{
    reason?: string;
    items?: Array<{ quantity?: number }>;
  }> | null;
  items?: Array<{ quantity?: number }>;
  rawPayload?: unknown;
} | null): boolean {
  if (!order) return false;

  // 1. 出库明确标记全单退货对冲
  if (order.outboundMeta?.isFullyReturned === true) {
    return true;
  }

  // 2. 状态文本本身含有退款成功/已退款/全额退款
  const statusText = String(order.status || "").trim();
  if (/已退款|全额退款|退款成功|全部退款/.test(statusText)) {
    return true;
  }

  const rawPayloadObj = order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)
    ? (order.rawPayload as Record<string, unknown>)
    : null;
  const rawRefundAmount = rawPayloadObj ? Number(rawPayloadObj.refundAmount ?? rawPayloadObj.refund_amount) : 0;
  const actualPaid = Math.max(0, Number(order.actualPaid || (rawPayloadObj?.actualPaid ?? rawPayloadObj?.actual_paid) || 0));
  const refundAmount = Math.max(0, Number(order.refundAmount || (Number.isFinite(rawRefundAmount) && rawRefundAmount > 0 ? rawRefundAmount : 0)));

  // 3. 退款金额大于等于实付金额（全额退款）
  if (actualPaid > 0 && refundAmount >= actualPaid) {
    return true;
  }

  // 4. 到手为 0 且存在退款金额或退货记录（整单退款）
  const expectedIncome = order.expectedIncome != null ? Number(order.expectedIncome) : (rawPayloadObj?.expectedIncome != null ? Number(rawPayloadObj.expectedIncome) : null);
  if (expectedIncome === 0 && actualPaid > 0 && refundAmount > 0) {
    return true;
  }

  // 5. 检查出库退货详情：如果退货商品总数 >= 订单商品总数（且大于0）
  const returnDetails = Array.isArray(order.outboundReturnDetails) ? order.outboundReturnDetails : [];
  if (returnDetails.length > 0 && Array.isArray(order.items) && order.items.length > 0) {
    const validReturnEntries = returnDetails.filter((e) => {
      const reason = String(e?.reason || "").trim();
      return !/重匹配|自动回滚|自动重建|改匹配/.test(reason);
    });
    if (validReturnEntries.length > 0) {
      const totalReturnedQuantity = validReturnEntries.reduce((sum, entry) => {
        return sum + (entry.items || []).reduce((iSum, it) => iSum + Math.max(0, Number(it.quantity || 0)), 0);
      }, 0);
      const totalOrderQuantity = order.items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity || 0)), 0);
      if (totalOrderQuantity > 0 && totalReturnedQuantity >= totalOrderQuantity) {
        return true;
      }
    }
  }

  return false;
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
  const fullyRefunded = isOrderFullyRefunded(order as any);
  if (value === "已取消" && fullyRefunded) {
    return true;
  }
  if (value === "已完成" && fullyRefunded) {
    return false;
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
    || normalized === "expect"
    || text.includes("expect")
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

/**
 * 判定订单的配送运单是否已取消、失效或不存在生效的第三方运力。
 * 典型场景：用户呼叫了配送后又取消了配送，或运单退单/配送异常。
 */
export function isDeliveryCancelledOrEmpty(order?: {
  status?: string | null;
  rawPayload?: unknown;
  delivery?: unknown;
} | null): boolean {
  if (!order) return true;

  const rawPayload = order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)
    ? order.rawPayload as Record<string, unknown>
    : {};
  const orderDelivery = order.delivery && typeof order.delivery === "object" && !Array.isArray(order.delivery)
    ? order.delivery as Record<string, unknown>
    : null;
  const rawPayloadDelivery = rawPayload.delivery && typeof rawPayload.delivery === "object" && !Array.isArray(rawPayload.delivery)
    ? rawPayload.delivery as Record<string, unknown>
    : null;

  // 1. 平台原始 delivery 显式为 false 或 null（代表当前没有生效运单）
  if (rawPayload.delivery === false) {
    return true;
  }

  // 2. 检查 cancel 实体（取消配送/退单记录）
  const cancelObj = rawPayload.cancel && typeof rawPayload.cancel === "object" && !Array.isArray(rawPayload.cancel)
    ? rawPayload.cancel as Record<string, unknown>
    : null;
  if (
    cancelObj?.is_cancel === "1"
    || cancelObj?.is_cancel === 1
    || cancelObj?.cancel_status === "1"
    || cancelObj?.cancel_status === 1
    || rawPayload.is_cancel === "1"
    || rawPayload.is_cancel === 1
    || rawPayload.cancel_status === "1"
    || rawPayload.cancel_status === 1
  ) {
    return true;
  }

  // 3. 检查运单轨迹与取消时间戳
  const cancelTime = rawPayloadDelivery?.cancel_time
    ?? rawPayloadDelivery?.cancelTime
    ?? orderDelivery?.cancel_time
    ?? orderDelivery?.cancelTime;
  if (cancelTime && cancelTime !== "0" && cancelTime !== 0) {
    return true;
  }

  const trackCandidates = [
    orderDelivery?.track,
    rawPayloadDelivery?.track,
  ].map((t) => String(t || "").trim()).filter(Boolean);
  if (trackCandidates.some((t) => /取消|退单|失效|异常/.test(t))) {
    return true;
  }

  // 4. 检查运单状态码 (麦芽田 99=取消, 10=异常)
  const deliveryStatusCandidates = [
    orderDelivery?.status,
    orderDelivery?.delivery_status,
    orderDelivery?.deliveryStatus,
    rawPayloadDelivery?.status,
    rawPayloadDelivery?.delivery_status,
    rawPayloadDelivery?.deliveryStatus,
  ].map((s) => String(s || "").trim().toLowerCase());
  if (deliveryStatusCandidates.some((s) => s === "99" || s === "10" || s === "cancel" || s === "cancelled" || s === "canceled")) {
    return true;
  }

  // 5. 订单自身处于“异常”状态（通常是取消当前配送后的平台状态）
  if (isAutoPickOrderAbnormalStatus(order.status)) {
    return true;
  }

  // 6. 如果 delivery 对象本身没有任何有效的第三方物流名称和骑手
  const logisticName = String(orderDelivery?.logisticName || orderDelivery?.logistic_name || rawPayloadDelivery?.logistic_name || "").trim();
  const riderName = String(orderDelivery?.riderName || orderDelivery?.delivery_name || rawPayloadDelivery?.delivery_name || "").trim();
  if (!logisticName && !riderName) {
    return true;
  }

  // 7. 自配送亦属于非第三方跑腿锁定状态
  if (/自配|自配送|商家自配|oneself/i.test(logisticName) || /自配|自配送|商家自配/i.test(riderName)) {
    return true;
  }

  return false;
}

export function isAutoPickOrderRiderAssigned(order?: {
  status?: string | null;
  rawPayload?: unknown;
  delivery?: unknown;
} | null) {
  if (!order) return false;

  // 关键：若运单已取消或不存在生效第三方运单，坚决返回 false！
  if (isDeliveryCancelledOrEmpty(order)) {
    return false;
  }

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
    order.status,
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
  const isPendingRiderByStatus = deliveryStatusCandidates.some((text) => /待接单|未接单/.test(text));
  const isAbnormalOrder = isAutoPickOrderAbnormalStatus(order.status);

  // 异常态通常是取消当前配送后的平台状态；此时旧骑手/旧轨迹不再代表有效履约。
  // 自配接口会先刷新异常订单，并在下发命令前按最新数据再次检查骑手状态。
  if (isAbnormalOrder || isCancelledByTime || isCancelledByStatus || isCancelledByTrack || isPendingRiderByTrack || isPendingRiderByStatus) {
    return false;
  }

  // 2. 检查运单轨迹是否明确处于生效中的骑手接单/到店状态
  const isRiderAssignedByTrack = trackCandidates.some((text) => /骑手已接单|配送已接单|抢单成功|接单成功|骑手已到店|待取货/.test(text));
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
    if (typeof d.manualDeliveryFee === "number" && d.manualDeliveryFee >= 0) {
      return false;
    }
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

export function parseDeliveryFeeToCents(rawValue: unknown): number {
  if (rawValue == null || rawValue === "") return 0;
  const num = Number(rawValue);
  if (!Number.isFinite(num) || num <= 0) return 0;

  // 若带小数点（如 5.50、6.5 元）或为浮点数，转为分
  if (String(rawValue).includes(".") || !Number.isInteger(num)) {
    return Math.round(num * 100);
  }
  // 麦芽田跑腿同城配送费多为 2~50 元整数区间，若小于 50 的正整数判定为元，转为分
  if (num > 0 && num < 50) {
    return Math.round(num * 100);
  }
  return Math.round(num);
}

export function readDeliveryFeeFromValue(delivery: unknown, rawPayloadOrFlag?: unknown) {
  const deliveryObj = (delivery && typeof delivery === "object" && !Array.isArray(delivery))
    ? delivery as Record<string, unknown>
    : null;

  const rawObj = (rawPayloadOrFlag && typeof rawPayloadOrFlag === "object" && !Array.isArray(rawPayloadOrFlag))
    ? rawPayloadOrFlag as Record<string, unknown>
    : null;

  const systemMeta = (rawObj?.systemMeta && typeof rawObj.systemMeta === "object" && !Array.isArray(rawObj.systemMeta))
    ? rawObj.systemMeta as Record<string, unknown>
    : null;

  const manualFeeValue = typeof deliveryObj?.manualDeliveryFee === "number" && deliveryObj.manualDeliveryFee >= 0
    ? deliveryObj.manualDeliveryFee
    : (systemMeta?.manualDeliveryFee && typeof (systemMeta.manualDeliveryFee as any)?.deliveryFee === "number")
    ? (systemMeta.manualDeliveryFee as any).deliveryFee
    : null;

  if (manualFeeValue != null) {
    return Math.max(0, Math.round(Number(manualFeeValue)));
  }

  if (isSelfDeliveryOrCancelledDelivery(delivery, rawPayloadOrFlag)) {
    return 0;
  }

  const rawDelivery = (rawObj?.delivery && typeof rawObj.delivery === "object" && !Array.isArray(rawObj.delivery))
    ? rawObj.delivery as Record<string, unknown>
    : null;

  const rawFeeObj = (rawObj?.fee && typeof rawObj.fee === "object" && !Array.isArray(rawObj.fee))
    ? rawObj.fee as Record<string, unknown>
    : null;

  // 平台的 send_fee / delivery_fee 已包含 premium_fee，但不包含骑手小费 tip。
  // 因此最终支出为平台配送费 + tip，不能再重复累加 premium_fee。原始载荷优先于数据库中旧的标准化值，
  // 这样历史上曾错误保存为 send_fee + premium_fee 的订单也能在读取时自动纠正。
  const candidates = [
    rawDelivery?.send_fee,
    rawDelivery?.sendFee,
    rawDelivery?.delivery_fee,
    rawDelivery?.deliveryFee,
    rawDelivery?.carrier_fee,
    rawDelivery?.carrierFee,
    rawDelivery?.actual_fee,
    rawDelivery?.actualFee,
    rawDelivery?.pay_fee,
    rawDelivery?.payFee,
    rawDelivery?.total_fee,
    rawDelivery?.fee,
    rawDelivery?.money,
    rawDelivery?.price,
    rawObj?.delivery_fee,
    rawObj?.deliveryFee,
    rawObj?.send_fee,
    rawObj?.sendFee,
    rawObj?.shipping_fee,
    rawObj?.shippingFee,
    rawFeeObj?.delivery_fee,
    rawFeeObj?.deliveryFee,
    rawFeeObj?.send_fee,
    rawFeeObj?.sendFee,
    rawFeeObj?.shipping_fee,
    deliveryObj?.send_fee,
    deliveryObj?.delivery_fee,
    deliveryObj?.sendFee,
    deliveryObj?.deliveryFee,
    deliveryObj?.carrier_fee,
    deliveryObj?.carrierFee,
    deliveryObj?.actual_fee,
    deliveryObj?.actualFee,
    deliveryObj?.pay_fee,
    deliveryObj?.payFee,
    deliveryObj?.total_fee,
    deliveryObj?.fee,
    deliveryObj?.money,
    deliveryObj?.price,
  ];

  const tip = parseDeliveryFeeToCents(deliveryObj?.tip ?? rawDelivery?.tip ?? rawObj?.tip);

  for (const candidate of candidates) {
    const parsed = parseDeliveryFeeToCents(candidate);
    if (parsed > 0) {
      return parsed + tip;
    }
  }

  // 极少数载荷没有最终费用字段时，才用独立费用构成兜底。
  const premiumFee = parseDeliveryFeeToCents(
    deliveryObj?.premium_fee ?? deliveryObj?.premiumFee ?? rawDelivery?.premium_fee ?? rawDelivery?.premiumFee
  );

  return tip + premiumFee;
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

/**
 * 判定订单是否属于“尚未到达配送时间的预约单”。
 * 规则：
 * 1. 非预约单（!order.isSubscribe）不锁定；
 * 2. 已收到平台到期/expect 通知（如麦芽田 expect 广播），代表已到达备餐出餐配送期，不锁定；
 * 3. 若有发单时间 send_time，当前时间已到达发单时间，不锁定；
 * 4. 送达时间若是今天，且距离送达时间不足 60 分钟（或已超时），已进入紧急履约配送窗口，不锁定，允许自配；
 * 5. 未来日期（明天及以后）或尚未到发单时间的真正预约单，进行锁定，禁止点击配送/自配。
 */
export function isLockedSubscribeOrder(order: {
  isSubscribe?: boolean | null;
  deliveryDeadline?: string | null;
  deliveryTimeRange?: string | null;
  orderTime?: Date | string | null;
  rawPayload?: unknown;
}): boolean {
  if (!order.isSubscribe) {
    return false;
  }

  const raw = (order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload))
    ? order.rawPayload as Record<string, unknown>
    : null;

  // 1. 如果已收到 expect 提示或到达期望时间标记，代表平台已通知商家进入备餐/配送期，允许自配
  if (
    raw?.hasArrivedExpect === true
    || raw?.status === "expect"
    || (raw as Record<string, unknown>)?.expect_status === "1"
    || (raw as Record<string, unknown>)?.expectStatus === "1"
  ) {
    return false;
  }

  const now = Date.now();

  // 2. 检查发单时间戳 send_time (秒级时间戳)
  const sendTimeSec = Number(raw?.send_time || 0);
  if (Number.isFinite(sendTimeSec) && sendTimeSec > 0) {
    const sendTimeMs = sendTimeSec * 1000;
    if (now >= sendTimeMs) {
      return false; // 发单时间已到，解除锁定
    }
    return true; // 发单时间未到，锁定
  }

  // 3. 检查送达时间字符串
  const timeText = String(
    raw?.delivery_time_format
    || raw?.send_time_format
    || order.deliveryTimeRange
    || order.deliveryDeadline
    || ""
  ).trim();

  if (!timeText) {
    // 无法判断时间，作为预约单默认锁定
    return true;
  }

  // 明确是未来日期的预约单 (明天/后天)
  if (/明日|明天|后日|后天/.test(timeText)) {
    return true;
  }

  // 提取日期 MM-DD 或 YYYY-MM-DD
  const dateMatch = timeText.match(/(?:(\d{4})[-/.年])?(\d{1,2})[-/.月](\d{1,2})/);
  const nowShanghaiDateStr = formatLocalDate(new Date());
  const [, , monthStr, dayStr] = dateMatch || [];

  if (monthStr && dayStr) {
    const curYear = new Date().getFullYear();
    const targetMonth = Number(monthStr);
    const targetDay = Number(dayStr);
    const targetDateStr = `${curYear}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;

    if (targetDateStr > nowShanghaiDateStr) {
      // 明确是今天之后的未来日期（例如 10-04 > 10-03）
      return true;
    }
  }

  // 4. 提取具体时间 HH:mm
  const timeMatch = timeText.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const [, hoursStr, minutesStr] = timeMatch;
    const targetHours = Number(hoursStr);
    const targetMinutes = Number(minutesStr);

    const targetDate = new Date();
    targetDate.setHours(targetHours, targetMinutes, 0, 0);

    // 如果送达时间是今天的，且在接下来的 60 分钟内送达，或者已经到了/超过送达时间
    // 说明已经进入紧急履约和出餐配送期，允许自配！
    const diffMs = targetDate.getTime() - now;
    if (diffMs <= 60 * 60 * 1000) {
      return false;
    }

    // 如果送达时间在 60 分钟之后（比如离现在还有好几个小时），仍然锁定
    return true;
  }

  return true;
}

