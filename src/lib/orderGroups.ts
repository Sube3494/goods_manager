import { getBaseAutoPickStatusDisplay, isOrderFullyRefunded } from "./autoPickOrderStatus";
import type { AutoPickOrder } from "./types";

export const ORDER_GROUPS = [
  { key: "pending", label: "处理中" },
  { key: "outbound", label: "待出库" },
  { key: "completed", label: "已完成" },
  { key: "closed", label: "已取消" },
  { key: "brush", label: "刷单" },
] as const;

export type OrderGroupKey = typeof ORDER_GROUPS[number]["key"];

const MANUAL_DELIVERY_PLACEHOLDER_PRODUCT_NO = "__manual_delivery_placeholder__";
const MANUAL_DELIVERY_PLACEHOLDER_PRODUCT_NAME = "手工配送占位商品";

function isManualDeliveryPlaceholderItem(item: { productNo?: string | null; productName?: string | null; rawPayload?: unknown }) {
  const rawPayload = item.rawPayload && typeof item.rawPayload === "object" && !Array.isArray(item.rawPayload)
    ? item.rawPayload as Record<string, unknown>
    : {};

  return String(item.productNo || "").trim() === MANUAL_DELIVERY_PLACEHOLDER_PRODUCT_NO
    || rawPayload.isManualDeliveryPlaceholder === true
    || String(item.productName || "").trim() === MANUAL_DELIVERY_PLACEHOLDER_PRODUCT_NAME;
}

export function hasOrderFulfillmentItems(items?: AutoPickOrder["items"] | null): boolean {
  if (!items || !Array.isArray(items) || items.length === 0) return false;
  return items.some((item) => {
    const rawPayload = item.rawPayload && typeof item.rawPayload === "object" && !Array.isArray(item.rawPayload)
      ? item.rawPayload as Record<string, unknown>
      : {};
    const isIgnored = rawPayload.ignoreOutbound === true
      || rawPayload.isManualIgnored === true
      || (item.matchedProduct as any)?.ignoreOutbound === true;
    if (isIgnored) return false;

    if (!isManualDeliveryPlaceholderItem(item)) {
      return true;
    }

    const hasDisplayItems = Array.isArray((item as any).displayItems) && (item as any).displayItems.length > 0;
    return Boolean(item.matchedProduct || hasDisplayItems);
  });
}

// 只有履约已完成且确认出库的普通订单才能进入已完成分组。
// 纯配送/跑腿等无需出库商品的订单在履约完成后直接进入已完成。
// 全单退款的订单统一归入已取消分组。
export function getOrderGroup(order: AutoPickOrder, isBrush: boolean): OrderGroupKey {
  const status = getBaseAutoPickStatusDisplay(order.status);
  const fullyRefunded = isOrderFullyRefunded(order);
  if (order.isDeleted || status === "已删除" || status === "已取消" || fullyRefunded) return "closed";
  if (isBrush) return "brush";
  if (status !== "已完成") return "pending";

  const hasItems = Array.isArray(order.items);
  const needsFulfillment = hasItems ? hasOrderFulfillmentItems(order.items) : true;

  if (needsFulfillment) {
    if (order.hasOutbound !== true || order.productCostStatus === "pending-outbound") {
      return "outbound";
    }
  }

  return "completed";
}

