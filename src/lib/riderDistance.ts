import type { AutoPickOrder } from "./types";
import { isAutoPickOrderTerminalStatus, isDeliveryCancelledOrEmpty, isAutoPickOrderSelfDeliveryActive, isAutoPickOrderRiderAssigned, isAutoPickPickupOrder } from "./autoPickOrderStatus";

type Point = { lng: number; lat: number };
export type RiderTrail = {
  distance?: string | number;
  statusName?: string;
  orderStatus?: string;
  isTakeGoods?: boolean;
  dispatcher?: Point | null;
  sender?: Point | null;
  receiver?: Point | null;
  skipped?: boolean;
};

export function canShowRiderDistance(order: AutoPickOrder) {
  return Boolean(order.deliveryId) && !order.isPickup
    && !isAutoPickPickupOrder(order.rawPayload, order.userAddress, order.shopAddress)
    && !isAutoPickOrderTerminalStatus(order.status)
    && !isDeliveryCancelledOrEmpty(order)
    && !isAutoPickOrderSelfDeliveryActive(order);
}

function formatMeters(meters: number) {
  return meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;
}

export function getRiderDistance(order: AutoPickOrder, trail: RiderTrail | null) {
  if (!trail || trail.skipped || !canShowRiderDistance(order)) return null;
  const status = `${trail.statusName || ""} ${trail.orderStatus || ""} ${order.delivery?.track || ""}`;
  if (/已完成|已送达|配送完成|取消|cancel|done|finished|completed/i.test(status)) return null;
  if (/待分配|待接单|未接单|unassigned|unaccepted/i.test(`${trail.statusName || ""} ${trail.orderStatus || ""}`)) return null;
  const delivering = trail.isTakeGoods === true
    || /配送中|送货中|送件中|已取货|派送中|delivering|shipping|\bsend\b|\bdelivery\b/i.test(status);
  const pickingUp = /待取货|已接单|取货中|已到店|到店|pickup|accepted|assign|arrival|arrived/i.test(status)
    || isAutoPickOrderRiderAssigned(order);
  if (!delivering && !pickingUp) return null;
  const raw = String(trail.distance ?? "").trim();
  let distance = "";
  if (/^\d+(\.\d+)?$/.test(raw)) distance = formatMeters(Number(raw));
  else {
    const match = raw.match(/^(\d+(\.\d+)?)\s*(米|公里|千米|km|m)$/i);
    if (match) distance = `${match[1]}${/^(公里|千米|km)$/i.test(match[3]) ? "km" : "m"}`;
  }
  if (!distance) return null;
  return { phase: delivering ? "delivery" : "pickup", label: delivering ? "送货" : "取货", distance, estimated: false };
}
