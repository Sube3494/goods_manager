import { expect, test } from "bun:test";
import { mergeFixedPromotionExpenses, parsePromotionAmounts, validPromotionDate } from "../src/lib/fixedPromotion";
import { parseAsShanghaiTime, formatLocalDate } from "../src/lib/dateUtils";

const date = parseAsShanghaiTime;
const stamp = new Date("2026-10-01T00:00:00Z");
const rule = (start, amount, shop = "A") => ({ id: `${shop}:${start}`, userId: "owner", shopName: shop, effectiveDate: new Date(`${start}T00:00:00Z`), amountMeituan: amount, amountJingdong: 0, amountTaobao: 0, amountOther: 0, createdAt: stamp, updatedAt: stamp });
const manual = (day, amount, shop = "A") => ({ id: `manual:${day}`, userId: "owner", shopName: shop, date: date(day), amount, amountMeituan: amount, amountJingdong: 0, amountTaobao: 0, createdAt: stamp, updatedAt: stamp });

test("每日规则从生效日期开始，跨月继续累计且不提前计入未来费用", () => {
  const items = mergeFixedPromotionExpenses([], [rule("2026-09-30", 10)], date("2026-09-29"), date("2026-10-03"), "2026-10-02");
  expect(items.map((item) => formatLocalDate(item.date))).toEqual(["2026-09-30", "2026-10-01", "2026-10-02"]);
  expect(items.reduce((sum, item) => sum + item.amount, 0)).toBe(30);
});

test("单日记录覆盖固定费用，手动零元也不会被固定费用回填", () => {
  const items = mergeFixedPromotionExpenses([manual("2026-10-02", 0)], [rule("2026-10-01", 10)], date("2026-10-01"), date("2026-10-03"), "2026-10-03");
  expect(items.map((item) => item.amount)).toEqual([10, 0, 10]);
});

test("改价与停止仅从新生效日期开始，各店铺费用独立", () => {
  const items = mergeFixedPromotionExpenses([], [rule("2026-10-01", 10), rule("2026-10-02", 20), rule("2026-10-03", 0), rule("2026-10-01", 5, "B")], date("2026-10-01"), date("2026-10-04"), "2026-10-04");
  expect(items.filter((item) => item.shopName === "A").map((item) => item.amount)).toEqual([10, 20]);
  expect(items.filter((item) => item.shopName === "B").map((item) => item.amount)).toEqual([5, 5, 5, 5]);
});

test("四个平台独立累计且金额精确到分", () => {
  const amounts = parsePromotionAmounts({ amountMeituan: 0.1, amountJingdong: 0.2, amountTaobao: 1.25, amountOther: 2.5 });
  const items = mergeFixedPromotionExpenses([], [{ ...rule("2026-10-01", 0), ...amounts }], date("2026-10-01"), date("2026-10-01"), "2026-10-01");
  expect(items[0].amount).toBe(4.05);
  expect(items[0].amountTaobao).toBe(1.25);
});

test("兼容旧 UTC 午夜记录，仍覆盖上海午夜固定费用", () => {
  const items = mergeFixedPromotionExpenses([{ ...manual("2026-10-01", 7), date: new Date("2026-10-01T00:00:00Z") }], [rule("2026-10-01", 10)], date("2026-10-01"), date("2026-10-01 23:59:59"), "2026-10-01");
  expect(items).toHaveLength(1);
  expect(items[0].amount).toBe(7);
});

test("拒绝非法金额和不存在的日期", () => {
  expect(validPromotionDate("2026-02-30")).toBe(false);
  expect(validPromotionDate("2028-02-29")).toBe(true);
  for (const amount of [-1, Infinity, "garbage"]) expect(() => parsePromotionAmounts({ amountMeituan: amount })).toThrow();
});
