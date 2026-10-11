import { expect, test } from "bun:test";
import { mergeFixedPromotionExpenses, parsePromotionAmounts, validPromotionDate } from "../src/lib/fixedPromotion";
import { parseAsShanghaiTime, formatLocalDate } from "../src/lib/dateUtils";

const date = parseAsShanghaiTime;
const stamp = new Date("2026-10-01T00:00:00Z");
const rule = (start, amount, shop = "A") => ({ id: `${shop}:${start}`, userId: "owner", shopName: shop, effectiveDate: new Date(`${start}T00:00:00Z`), amountMeituan: amount, amountJingdong: 0, amountTaobao: 0, amountOther: 0, createdAt: stamp, updatedAt: stamp });
const manual = (day, amount, shop = "A") => ({ id: `manual:${day}`, userId: "owner", shopName: shop, date: date(day), amount, amountMeituan: amount, amountJingdong: 0, amountTaobao: 0, createdAt: stamp, updatedAt: new Date("2026-10-12T00:00:00Z") });

test("每日规则从生效日期开始，跨月继续累计且不提前计入未来费用", () => {
  const items = mergeFixedPromotionExpenses([], [rule("2026-09-30", 10)], date("2026-09-29"), date("2026-10-03"), "2026-10-02");
  expect(items.map((item) => formatLocalDate(item.date))).toEqual(["2026-09-30", "2026-10-01", "2026-10-02"]);
  expect(items.reduce((sum, item) => sum + item.amount, 0)).toBe(30);
});

test("固定保存后重新修改单日费用可以覆盖固定费用，手动零元也生效", () => {
  const items = mergeFixedPromotionExpenses([manual("2026-10-02", 0)], [rule("2026-10-01", 10)], date("2026-10-01"), date("2026-10-03"), "2026-10-03");
  expect(items.map((item) => item.amount)).toEqual([10, 0, 10]);
});

test("新保存的固定范围覆盖旧每日记录，范围外与其他店铺不受影响", () => {
  const fixed = { ...rule("2026-10-02", 10), endDate: new Date("2026-10-03T00:00:00Z"), updatedAt: new Date("2026-10-11T00:00:00Z") };
  const old = day => ({ ...manual(day, 8), updatedAt: stamp });
  const items = mergeFixedPromotionExpenses([old("2026-10-01"), old("2026-10-02"), { ...old("2026-10-03"), amount: 0, amountMeituan: 0 }, old("2026-10-04"), { ...old("2026-10-02"), shopName: "B" }], [fixed], date("2026-10-01"), date("2026-10-04"), "2026-10-11");
  expect(items.filter(item => item.shopName === "A").map(item => item.amount)).toEqual([8, 10, 10, 8]);
  expect(items.find(item => item.shopName === "B").amount).toBe(8);
});

test("固定零元覆盖旧单日金额，同一时间保存时固定设置优先", () => {
  const old = { ...manual("2026-10-01", 8), updatedAt: stamp };
  expect(mergeFixedPromotionExpenses([old], [rule("2026-10-01", 0)], date("2026-10-01"), date("2026-10-01"), "2026-10-01")).toHaveLength(0);
});

test("覆盖未来已填写金额时，日历预览固定费用而利润不提前扣", () => {
  const old = { ...manual("2026-10-20", 80), updatedAt: stamp };
  const fixed = { ...rule("2026-10-01", 10), endDate: new Date("2026-10-31T00:00:00Z"), updatedAt: new Date("2026-10-11T00:00:00Z") };
  expect(mergeFixedPromotionExpenses([old], [fixed], date("2026-10-20"), date("2026-10-20"), "2026-10-11")).toHaveLength(0);
  const preview = mergeFixedPromotionExpenses([old], [fixed], date("2026-10-20"), date("2026-10-20"), "2026-10-11", true);
  expect(preview).toHaveLength(1);
  expect(preview[0].amount).toBe(10);
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

test("整月范围含首尾，日历预览未来费用，概览只计入今天以前", () => {
  const monthly = { ...rule("2026-10-01", 10), endDate: new Date("2026-10-31T00:00:00Z") };
  const preview = mergeFixedPromotionExpenses([], [monthly], date("2026-09-30"), date("2026-11-01"), "2026-10-11", true);
  expect(preview).toHaveLength(31);
  expect(formatLocalDate(preview[0].date)).toBe("2026-10-01");
  expect(formatLocalDate(preview[30].date)).toBe("2026-10-31");
  expect(preview.reduce((total, item) => total + item.amount, 0)).toBe(310);
  const accrued = mergeFixedPromotionExpenses([], [monthly], date("2026-10-01"), date("2026-10-31"), "2026-10-11");
  expect(accrued.reduce((total, item) => total + item.amount, 0)).toBe(110);
});

test("跨月范围到期停止，重叠区间以最后保存为准且保留区间外设置", () => {
  const original = rule("2026-09-01", 5);
  const later = rule("2026-10-02", 7);
  const replacement = { ...rule("2026-09-30", 20), endDate: new Date("2026-10-03T00:00:00Z"), updatedAt: new Date("2026-10-11T00:00:00Z") };
  const items = mergeFixedPromotionExpenses([], [original, later, replacement], date("2026-09-29"), date("2026-10-04"), "2026-10-11");
  expect(items.map(item => item.amount)).toEqual([5, 20, 20, 20, 20, 7]);
  const isolated = mergeFixedPromotionExpenses([], [replacement], date("2026-09-29"), date("2026-10-04"), "2026-10-11");
  expect(isolated).toHaveLength(4);
});

test("范围内当天手动费用优先，零额范围只暂停该区间", () => {
  const pause = { ...rule("2026-10-02", 0), endDate: new Date("2026-10-03T00:00:00Z"), updatedAt: new Date("2026-10-11T00:00:00Z") };
  const items = mergeFixedPromotionExpenses([manual("2026-10-03", 8)], [rule("2026-10-01", 10), pause], date("2026-10-01"), date("2026-10-04"), "2026-10-11");
  expect(items.map(item => item.amount)).toEqual([10, 8, 10]);
});
