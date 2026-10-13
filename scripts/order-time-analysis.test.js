import { expect, test } from "bun:test";
import { buildOrderTimeBuckets, summarizeOrderTime } from "../src/lib/orderTimeAnalysis";

test("按北京时间处理跨日、小时边界与不带时区的下单时间", () => {
  const buckets = buildOrderTimeBuckets([
    { orderTime: new Date("2026-10-12T16:00:00Z") },
    { orderTime: "2026-10-13T15:59:59.999Z" },
    { orderTime: "2026-10-13 09:59:59" },
    { orderTime: "2026-10-13T10:00:00+08:00" },
    { orderTime: "invalid" },
  ]);
  expect(buckets).toHaveLength(24);
  for (const hour of [0, 9, 10, 23]) expect(buckets[hour].count).toBe(1);
  expect(buckets[23].label).toBe("23:00–24:00");
  expect(buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(4);
});

test("区分真实与刷单，取消或退款不改变来单归属，总量等于两类之和", () => {
  const orders = [
    { orderTime: "2026-10-12 09:00:00", status: "已完成" },
    { orderTime: "2026-10-13 09:00:00", status: "已取消" },
    { orderTime: "2026-10-13 09:30:00", status: "全额退款" },
    { orderTime: "2026-10-13 10:00:00", status: "已完成" },
    { orderTime: "2026-10-13 10:30:00", isBrush: true },
    { orderTime: "2026-10-13 10:45:00", status: "已取消" },
  ];
  const buckets = buildOrderTimeBuckets(orders);
  const summary = summarizeOrderTime(buckets, 4);
  expect(summary.total).toBe(6);
  expect(summary.peaks.map((bucket) => bucket.hour)).toEqual([9, 10]);
  expect(summary.peakCount).toBe(3);
  expect(summary.peakShare).toBe(0.5);
  expect(summary.averagePerDay).toBe(1.5);
  expect(buildOrderTimeBuckets(orders)).toEqual(buildOrderTimeBuckets(orders.map(({ status, ...order }) => order)));
  for (const bucket of buckets) expect(bucket.count).toBe(bucket.real + bucket.brush);
  const real = summarizeOrderTime(buckets, 4, "real");
  const brush = summarizeOrderTime(buckets, 4, "brush");
  expect(real.total).toBe(5);
  expect(real.peaks.map((bucket) => bucket.hour)).toEqual([9]);
  expect(brush.total).toBe(1);
  expect(brush.peaks.map((bucket) => bucket.hour)).toEqual([10]);
  expect(real.total + brush.total).toBe(summary.total);
});

test("无订单时不存在高峰，不产生 NaN 或无穷大", () => {
  expect(summarizeOrderTime(buildOrderTimeBuckets([]), 0)).toEqual({
    total: 0, peakCount: 0, peaks: [], peakShare: 0, averagePerDay: 0,
  });
});
