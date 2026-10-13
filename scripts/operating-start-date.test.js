import { expect, test } from "bun:test";
import { getDailyOperatingCostAfterFirstOrder } from "../src/lib/operatingCosts";
import { createDashboardFirstOrderDateLookup } from "../src/lib/dashboardOrderRange";

const profile = { monthlyRent: 3000, monthlyLabor: 6000, allocationBaseDays: 30 };
const bill = { monthKey: "2026-06", waterAmount: 300, electricAmount: 600 };

test("经营起点只使用订单列表的下单时间，不使用更早的刷单、出库或创建日期", async () => {
  const orders = [
    { id: "a", shop: "甲店", orderTime: new Date("2026-06-15T02:00:00Z"), createdAt: new Date("2026-02-14T00:00:00Z") },
    { id: "b", shop: "乙店", orderTime: new Date("2026-07-01T02:00:00Z"), createdAt: new Date("2026-04-12T00:00:00Z") },
  ];
  const reads = [];
  const getFirstOrderDate = createDashboardFirstOrderDateLookup(async (shop) => {
    reads.push(shop);
    return orders;
  }, (order, shop) => !shop || order.shop === shop);
  const firstA = await getFirstOrderDate("甲店");
  const firstB = await getFirstOrderDate("乙店");
  expect(firstA).toEqual(orders[0].orderTime);
  expect(firstB).toEqual(orders[1].orderTime);
  expect(await getFirstOrderDate("未开店")).toBeNull();
  expect(await getFirstOrderDate("")).toEqual(firstA);
  expect(await getFirstOrderDate("甲店")).toEqual(firstA);
  expect(reads.filter(shop => shop === "甲店")).toHaveLength(1);
  expect(getDailyOperatingCostAfterFirstOrder("2026-04-12", firstA.toISOString().slice(0, 10), profile)).toBe(0);
  expect(getDailyOperatingCostAfterFirstOrder("2026-06-15", firstA.toISOString().slice(0, 10), profile)).toBe(300);
  expect(getDailyOperatingCostAfterFirstOrder("2026-06-15", firstB.toISOString().slice(0, 10), profile)).toBe(0);
});

test("首笔订单前不扣租金、人工和水电，首单当天开始按日计费", () => {
  expect(getDailyOperatingCostAfterFirstOrder("2026-04-20", "2026-06-15", profile, bill)).toBe(0);
  expect(getDailyOperatingCostAfterFirstOrder("2026-06-14", "2026-06-15", profile, bill)).toBe(0);
  expect(getDailyOperatingCostAfterFirstOrder("2026-06-15", "2026-06-15", profile, bill)).toBe(330);
  expect(getDailyOperatingCostAfterFirstOrder("2026-06-16", "2026-06-15", profile, bill)).toBe(330);
});

test("每家店使用自己的首单日期，未产生首单的门店不计费", () => {
  const day = "2026-06-15";
  const shopA = getDailyOperatingCostAfterFirstOrder(day, "2026-06-01", profile);
  const shopB = getDailyOperatingCostAfterFirstOrder(day, "2026-07-01", profile);
  const shopC = getDailyOperatingCostAfterFirstOrder(day, null, profile, bill);
  expect(shopA).toBe(300);
  expect(shopB).toBe(0);
  expect(shopC).toBe(0);
  expect(shopA + shopB + shopC).toBe(300);
});

test("首单后无订单日期仍扣日成本，水电只分摊对应账单月份", () => {
  expect(getDailyOperatingCostAfterFirstOrder("2026-07-01", "2026-06-15", profile, bill)).toBe(300);
  expect(getDailyOperatingCostAfterFirstOrder("2026-06-30", "2026-06-15", null, bill)).toBe(30);
});
