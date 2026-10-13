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

type TimedOrder = { orderNo: string; platform: string; orderTime: Date | string; isBrush?: boolean; included?: boolean };
type BrushRecord = { id: string; platformOrderId?: string | null; platform: string; included?: boolean };

export function buildOrderTimeAnalysis(orders: ReadonlyArray<TimedOrder>, brushRecords: ReadonlyArray<BrushRecord>) {
  const key = (platform: string, orderNo: string) => JSON.stringify([platform, orderNo.trim()]);
  const brushKeys = new Set(brushRecords.filter((record) => record.platformOrderId?.trim()).map((record) => key(record.platform, record.platformOrderId!)));
  const knownOrders = new Set<string>();
  const timedOrders: Array<{ orderTime: Date | string; isBrush: boolean }> = [];
  for (const order of orders) {
    const orderKey = key(order.platform, order.orderNo);
    if (knownOrders.has(orderKey)) continue;
    knownOrders.add(orderKey);
    if (order.included === false) continue;
    timedOrders.push({ orderTime: order.orderTime, isBrush: Boolean(order.isBrush || brushKeys.has(orderKey)) });
  }
  let brushWithoutTime = 0;
  const countedBrushRecords = new Set<string>();
  for (const record of brushRecords) {
    if (record.included === false) continue;
    const recordKey = record.platformOrderId?.trim() ? key(record.platform, record.platformOrderId) : `record:${record.id}`;
    if (knownOrders.has(recordKey) || countedBrushRecords.has(recordKey)) continue;
    countedBrushRecords.add(recordKey);
    brushWithoutTime += 1;
  }
  return { buckets: buildOrderTimeBuckets(timedOrders), brushWithoutTime };
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
