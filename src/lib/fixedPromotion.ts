import { FinanceMath } from "./math";
import { formatLocalDate, parseAsShanghaiTime } from "./dateUtils";

export const PROMOTION_AMOUNT_FIELDS = ["amountMeituan", "amountJingdong", "amountTaobao", "amountOther"] as const;
export type PromotionAmounts = Record<typeof PROMOTION_AMOUNT_FIELDS[number], number>;
export type FixedPromotionRule = PromotionAmounts & { id: string; userId: string; shopName: string; effectiveDate: Date; endDate?: Date | null; createdAt: Date; updatedAt: Date };
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
  includeFuture = false,
): PromotionExpenseRecord[] {
  const start = formatLocalDate(startDate);
  const end = formatLocalDate(endDate);
  const result = new Map<string, PromotionExpenseRecord>();
  // 先取当天最后一次手动记录；兼容历史记录不同的午夜时区。
  for (const item of manual) {
    const day = formatLocalDate(item.date);
    if (day < start || day > end || !includeFuture && day > today) continue;
    const key = `${day}:${item.shopName}`;
    const previous = result.get(key);
    if (!previous || previous.updatedAt <= item.updatedAt) result.set(key, item);
  }
  const preparedRules = prepareRules(rules);
  for (let cursor = parseAsShanghaiTime(start); formatLocalDate(cursor) <= end && (includeFuture || formatLocalDate(cursor) <= today); cursor = new Date(cursor.getTime() + 86400000)) {
    const day = formatLocalDate(cursor);
    for (const rule of selectActiveRules(preparedRules, day)) {
      const key = `${day}:${rule.shopName}`;
      const manualRecord = result.get(key);
      // 固定设置覆盖之前填写的每日费用，之后重新修改当天费用仍可覆盖固定设置。
      if (manualRecord && manualRecord.updatedAt > rule.updatedAt) continue;
      const amount = FinanceMath.sum(...PROMOTION_AMOUNT_FIELDS.map((field) => rule[field]));
      if (amount === 0) {
        result.delete(key);
        continue;
      }
      result.set(key, {
        id: `fixed:${rule.id}:${day}`, userId: rule.userId, shopName: rule.shopName, date: new Date(cursor), amount,
        amountMeituan: rule.amountMeituan, amountJingdong: rule.amountJingdong, amountTaobao: rule.amountTaobao,
        createdAt: rule.createdAt, updatedAt: rule.updatedAt,
      });
    }
  }
  return [...result.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

// 重叠区间按最后一次保存的设置生效；结束后恢复区间外原有设置。
export function getActiveFixedPromotionRules<T extends FixedPromotionRule>(rules: T[], day: string): T[] {
  return selectActiveRules(prepareRules(rules), day);
}

function prepareRules<T extends FixedPromotionRule>(rules: T[]) {
  return rules.map(rule => ({ rule, start: formatLocalDate(rule.effectiveDate), end: rule.endDate ? formatLocalDate(rule.endDate) : null }));
}

function selectActiveRules<T extends FixedPromotionRule>(rules: ReturnType<typeof prepareRules<T>>, day: string): T[] {
  const active = new Map<string, T>();
  for (const { rule, start, end } of rules) {
    if (start > day || end && end < day) continue;
    const previous = active.get(rule.shopName);
    if (!previous || rule.updatedAt > previous.updatedAt || rule.updatedAt.getTime() === previous.updatedAt.getTime() && rule.effectiveDate >= previous.effectiveDate) {
      active.set(rule.shopName, rule);
    }
  }
  return [...active.values()];
}
