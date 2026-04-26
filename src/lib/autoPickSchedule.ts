import { parseAsShanghaiTime } from "@/lib/dateUtils";

const PICKUP_MINUTES = 5;
const MINUTES_PER_KM = 3;
const RIDER_UPSTAIRS_MINUTES = 8;
const DELIVERY_DEADLINE_LEAD_MINUTES = 5;

export type SchedulableAutoPickOrder = {
  orderTime: Date | string;
  distanceKm?: number | null;
  distanceIsLinear?: boolean | null;
  deliveryDeadline?: string | null;
  longitude?: number | null;
  latitude?: number | null;
  shopLongitude?: number | null;
  shopLatitude?: number | null;
};

export function calculateStraightLineDistanceKm(
  origin: { longitude: number; latitude: number },
  destination: { longitude: number; latitude: number }
) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6378.137;
  const latDiff = toRadians(destination.latitude - origin.latitude);
  const lngDiff = toRadians(destination.longitude - origin.longitude);
  const lat1 = toRadians(origin.latitude);
  const lat2 = toRadians(destination.latitude);

  const a =
    Math.sin(latDiff / 2) * Math.sin(latDiff / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDiff / 2) * Math.sin(lngDiff / 2);

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

export function resolveSchedulingDistanceKm(order: SchedulableAutoPickOrder) {
  if (typeof order.distanceKm === "number" && order.distanceIsLinear === false) {
    return order.distanceKm;
  }

  const hasShopCoord = Number.isFinite(order.shopLongitude) && Number.isFinite(order.shopLatitude);
  const hasUserCoord = Number.isFinite(order.longitude) && Number.isFinite(order.latitude);
  if (hasShopCoord && hasUserCoord) {
    return calculateStraightLineDistanceKm(
      {
        longitude: Number(order.shopLongitude),
        latitude: Number(order.shopLatitude),
      },
      {
        longitude: Number(order.longitude),
        latitude: Number(order.latitude),
      }
    );
  }

  if (typeof order.distanceKm === "number") {
    return order.distanceKm;
  }

  return null;
}

export function parseExpectedDeliveryTime(deadlineText: string | null | undefined, orderTime: Date | string) {
  const text = String(deadlineText || "").replace(/\s+/g, " ").trim();
  if (!text) return null;

  const timeMatch = text.match(/(?:今日|今天|明日|明天|后日|后天)?\s*(\d{1,2}:\d{2})/);
  if (!timeMatch) return null;

  const baseDate = parseAsShanghaiTime(orderTime);
  const candidate = new Date(baseDate);
  candidate.setSeconds(0, 0);

  const [hours, minutes] = timeMatch[1].split(":").map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  candidate.setHours(hours, minutes, 0, 0);

  if (/明日|明天/.test(text)) {
    candidate.setDate(candidate.getDate() + 1);
  } else if (/后日|后天/.test(text)) {
    candidate.setDate(candidate.getDate() + 2);
  } else if ((/今日|今天/.test(text) || !/明日|明天|后日|后天/.test(text)) && candidate.getTime() < baseDate.getTime() - 60 * 1000) {
    candidate.setDate(candidate.getDate() + 1);
  }

  if (candidate.getTime() <= Date.now()) {
    return null;
  }

  return candidate;
}

export function getEstimatedAutoCompleteAt(order: SchedulableAutoPickOrder) {
  const distanceKm = resolveSchedulingDistanceKm(order);
  const heuristicAt = distanceKm != null
    ? new Date(Date.now() + (PICKUP_MINUTES + distanceKm * MINUTES_PER_KM + RIDER_UPSTAIRS_MINUTES) * 60 * 1000)
    : null;

  const expectedAt = parseExpectedDeliveryTime(order.deliveryDeadline, order.orderTime);
  const latestSafeAt = expectedAt
    ? new Date(expectedAt.getTime() - DELIVERY_DEADLINE_LEAD_MINUTES * 60 * 1000)
    : null;

  // 主逻辑仍然按 5 + 3*公里数 + 8分钟上下楼 计算，但如果会晚于预计送达前的安全时间，就向前截断。
  if (heuristicAt && latestSafeAt) {
    return heuristicAt.getTime() <= latestSafeAt.getTime() ? heuristicAt : latestSafeAt;
  }

  if (heuristicAt) {
    return heuristicAt;
  }

  if (latestSafeAt) {
    return latestSafeAt;
  }

  return null;
}
