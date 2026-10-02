import { getBaseAutoPickStatusDisplay } from "./autoPickOrderStatus";
import type { AutoPickOrder } from "./types";

export const ORDER_GROUPS = [
  { key: "pending", label: "待处理" },
  { key: "fulfilling", label: "履约中" },
  { key: "completed", label: "已完成" },
  { key: "closed", label: "已取消" },
  { key: "brush", label: "刷单" },
] as const;

export type OrderGroupKey = typeof ORDER_GROUPS[number]["key"];

// 出库和成本回填是独立维度，不改变订单的履约阶段。
export function getOrderGroup(order: AutoPickOrder, isBrush: boolean): OrderGroupKey {
  const status = getBaseAutoPickStatusDisplay(order.status);
  if (order.isDeleted || status === "已删除" || status === "已取消") return "closed";
  if (isBrush) return "brush";
  if (status === "已完成") return "completed";
  if (status === "异常" || status === "同步中") return "pending";
  if (status === "配送中") return "fulfilling";
  if (!order.isPickCompleted && /拣货中|备货中/.test(String(order.status || ""))) return "pending";
  if (status === "已拣货" || status === "待配送" || order.isPickCompleted) {
    return "fulfilling";
  }
  return "pending";
}
