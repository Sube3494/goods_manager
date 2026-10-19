import {
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
  if (isAutoPickOrderTerminalStatus(order.status) || isAutoPickOrderAbnormalStatus(order.status) || hasOrderRefundState(order)) return "订单已结束、退款或状态异常";
  if (isAutoPickPickupOrder(order.rawPayload, order.userAddress, order.shopAddress)) return "自提订单不需要自配";
  if (isAutoPickOrderSelfDeliveryActive(order) || isAutoPickOrderDeliveringStatus(order.status) || isAutoPickOrderRiderAssigned(order) || !isDeliveryCancelledOrEmpty(order)) return "订单已有配送任务或骑手已接单";
  return null;
}

export function isOrderReadyForQueuedSelfDelivery(order: QueueOrder & { isPickCompleted?: boolean }) {
  // “拣货中”不代表完成，不能使用会将其归为“已拣货”的展示状态。
  return order.isPickCompleted === true || isAutoPickPickCompleted(order.rawPayload)
    || /^(已拣货|拣货完成|已完成拣货|picked|pick_completed)$/i.test(String(order.status || "").trim());
}
