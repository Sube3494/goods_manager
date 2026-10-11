import { FinanceMath } from "./math";
import { formatLocalDate, parseAsShanghaiTime } from "./dateUtils";

export const PROMOTION_AMOUNT_FIELDS = ["amountMeituan", "amountJingdong", "amountTaobao", "amountOther"] as const;
export type PromotionAmounts = Record<typeof PROMOTION_AMOUNT_FIELDS[number], number>;
export type FixedPromotionRule = PromotionAmounts & { id: string; userId: string; shopName: string; effectiveDate: Date; createdAt: Date; updatedAt: Date };
export type PromotionExpenseRecord = Omit<FixedPromotionRule, "effectiveDate" | "amountOther"> & { date: Date; amount: number };

export function validPromotionDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parsePromotionAmounts(input: Record<string, unknown>): PromotionAmounts {
  const amounts = {} as PromotionAmounts;
  for (const field of PROMOTION_AMOUNT_FIELDS) {
    const value = input[field] ?? 0;
    if ((typeof value !== "number" && typeof value !== "string") || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1000000) {
      throw new Error("推广费必须为 0 到 1000000 之间的金额");
    }
    amounts[field] = Math.round(Number(value) * 100) / 100;
  }
  return amounts;
}

export function mergeFixedPromotionExpenses(
  manual: PromotionExpenseRecord[], rules: FixedPromotionRule[], startDate: Date, endDate: Date,
  today = formatLocalDate(new Date()),
): PromotionExpenseRecord[] {
  const start = formatLocalDate(startDate);
  const end = formatLocalDate(endDate);
  const result = new Map<string, PromotionExpenseRecord>();
  // 同一店铺同一天手动记录优先；兼容历史记录不同的午夜时区。
  for (const item of manual) {
    const day = formatLocalDate(item.date);
    if (day < start || day > end) continue;
    const key = `${day}:${item.shopName}`;
    const previous = result.get(key);
    if (!previous || previous.updatedAt <= item.updatedAt) result.set(key, item);
  }
  const ordered = [...rules].sort((a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime());
  const active = new Map<string, FixedPromotionRule>();
  let ruleIndex = 0;
  for (let cursor = parseAsShanghaiTime(start); formatLocalDate(cursor) <= end && formatLocalDate(cursor) <= today; cursor = new Date(cursor.getTime() + 86400000)) {
    const day = formatLocalDate(cursor);
    while (ruleIndex < ordered.length && formatLocalDate(ordered[ruleIndex].effectiveDate) <= day) {
      const rule = ordered[ruleIndex++];
      active.set(rule.shopName, rule);
    }
    for (const rule of active.values()) {
      const key = `${day}:${rule.shopName}`;
      if (result.has(key)) continue;
      const amount = FinanceMath.sum(...PROMOTION_AMOUNT_FIELDS.map((field) => rule[field]));
      if (amount === 0) continue;
      result.set(key, {
        id: `fixed:${rule.id}:${day}`, userId: rule.userId, shopName: rule.shopName, date: new Date(cursor), amount,
        amountMeituan: rule.amountMeituan, amountJingdong: rule.amountJingdong, amountTaobao: rule.amountTaobao,
        createdAt: rule.createdAt, updatedAt: rule.updatedAt,
      });
    }
  }
  return [...result.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}
