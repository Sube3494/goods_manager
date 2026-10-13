import { parseAsShanghaiTime } from "./dateUtils";

export type OrderTimeScope = "real" | "brush" | "count";

export interface OrderTimeBucket {
  hour: number;
  label: string;
  count: number;
  real: number;
  brush: number;
}

export function buildOrderTimeBuckets(orders: ReadonlyArray<{ orderTime: Date | string; isBrush?: boolean }>): OrderTimeBucket[] {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00–${String(hour + 1).padStart(2, "0")}:00`,
    count: 0, real: 0, brush: 0,
  }));
  for (const order of orders) {
    const time = parseAsShanghaiTime(order.orderTime).getTime();
    if (!Number.isFinite(time)) continue;
    const hour = new Date(time + 8 * 60 * 60 * 1000).getUTCHours();
    buckets[hour].count += 1;
    buckets[hour][order.isBrush ? "brush" : "real"] += 1;
  }
  return buckets;
}

export function summarizeOrderTime(buckets: ReadonlyArray<OrderTimeBucket>, rangeDays: number, scope: OrderTimeScope = "count") {
  const total = buckets.reduce((sum, bucket) => sum + bucket[scope], 0);
  const peakCount = Math.max(0, ...buckets.map((bucket) => bucket[scope]));
  const peaks = peakCount > 0 ? buckets.filter((bucket) => bucket[scope] === peakCount) : [];
  return {
    total, peakCount, peaks,
    peakShare: total > 0 ? peakCount / total : 0,
    averagePerDay: rangeDays > 0 ? total / rangeDays : 0,
  };
}
