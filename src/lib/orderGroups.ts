import { getBaseAutoPickStatusDisplay } from "./autoPickOrderStatus";
import type { AutoPickOrder } from "./types";

export const ORDER_GROUPS = [
  { key: "outbound", label: "待出库" },
  { key: "pending", label: "处理中" },
  { key: "completed", label: "已完成" },
  { key: "closed", label: "已取消" },
  { key: "brush", label: "刷单" },
] as const;

export type OrderGroupKey = typeof ORDER_GROUPS[number]["key"];

// 只有履约已完成且确认出库的普通订单才能进入已完成分组。
export function getOrderGroup(order: AutoPickOrder, isBrush: boolean): OrderGroupKey {
  const status = getBaseAutoPickStatusDisplay(order.status);
  if (order.isDeleted || status === "已删除" || status === "已取消") return "closed";
  if (isBrush) return "brush";
  if (status !== "已完成") return "pending";
  if (order.hasOutbound !== true || order.productCostStatus === "pending-outbound") return "outbound";
  return "completed";
}
