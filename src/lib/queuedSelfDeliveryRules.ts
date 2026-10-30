import {
  getBaseAutoPickStatusDisplay,
  isAutoPickOrderAbnormalStatus,
  isAutoPickOrderDeliveringStatus,
  isAutoPickOrderRiderAssigned,
  isAutoPickOrderSelfDeliveryActive,
  isAutoPickOrderTerminalStatus,
  isAutoPickPickCompleted,
  isAutoPickPickupOrder,
  isDeliveryCancelledOrEmpty,
} from "@/lib/autoPickOrderStatus";
import { hasOrderRefundState } from "@/lib/orderFinancials";

export type QueuedSelfDelivery = {
  token: string;
  status: "waiting" | "running" | "succeeded" | "cancelled" | "failed";
  requestedAt: string;
  updatedAt: string;
  error?: string;
};

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function readQueuedSelfDelivery(value: unknown): QueuedSelfDelivery | null {
  const job = asRecord(value);
  return ["waiting", "running", "succeeded", "cancelled", "failed"].includes(String(job.status))
    ? job as QueuedSelfDelivery : null;
}

type QueueOrder = {
  status?: string | null;
  platform?: string | null;
  rawPayload?: unknown;
  delivery?: unknown;
  userAddress?: string | null;
  shopAddress?: string | null;
  isSubscribe?: boolean;
  isMainSystemSelfDelivery?: boolean;
};

export function queuedSelfDeliveryBlockedReason(order: QueueOrder): string | null {
  const raw = asRecord(order.rawPayload);
  const subscribe = raw.is_subscribe ?? raw.isSubscribe;
  if (order.isSubscribe || subscribe === true || subscribe === 1 || subscribe === "1") return "预约单不支持自配";
  if (order.platform === "线下交易" || String(order.platform).toLowerCase() === "other") return "线下订单不支持自动自配";
  if (isAutoPickOrderTerminalStatus(order.status) || hasOrderRefundState(order)) return "订单已结束或退款";
  if (isAutoPickOrderAbnormalStatus(order.status) && !hasCancelledDeliveryProof(order)) return "订单状态异常，请先同步确认配送已取消";
  if (isAutoPickPickupOrder(order.rawPayload, order.userAddress, order.shopAddress)) return "自提订单不需要自配";
  if (isAutoPickOrderSelfDeliveryActive(order) || isAutoPickOrderDeliveringStatus(order.status) || isAutoPickOrderRiderAssigned(order) || !isDeliveryCancelledOrEmpty(order)) return "订单已有配送任务或骑手已接单";
  return null;
}

// 异常本身不等于配送已取消，恢复自动任务需要明确的运单取消凭据。
export function hasCancelledDeliveryProof(order: QueueOrder): boolean {
  const raw = asRecord(order.rawPayload);
  const cancel = asRecord(raw.cancel);
  if ([cancel.is_cancel, cancel.cancel_status, raw.is_cancel, raw.cancel_status].some(value => value === 1 || value === "1")) return true;
  return [asRecord(order.delivery), asRecord(raw.delivery)].some(delivery => {
    const time = delivery.cancel_time ?? delivery.cancelTime;
    return Boolean(time && time !== "0")
      || /取消|退单|失效/.test(String(delivery.track || ""))
      || [delivery.status, delivery.delivery_status, delivery.deliveryStatus].some(value => /^(99|cancel|cancelled|canceled)$/i.test(String(value ?? "")));
  });
}

export function isOrderReadyForQueuedSelfDelivery(order: QueueOrder & { isPickCompleted?: boolean }) {
  // 待配送是拣货后的阶段，历史订单缺少拣货标记也可继续自配。
  // “拣货中”不代表完成，不能用展示状态“已拣货”反推。
  return getBaseAutoPickStatusDisplay(order.status) === "待配送"
    || order.isPickCompleted === true || isAutoPickPickCompleted(order.rawPayload)
    || /^(已拣货|拣货完成|已完成拣货|picked|pick_completed)$/i.test(String(order.status || "").trim());
}
