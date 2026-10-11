import prisma from "@/lib/prisma";
import { isPrismaMissingTableError } from "@/lib/prismaSchemaCompat";
import { mergeFixedPromotionExpenses } from "@/lib/fixedPromotion";
import { formatLocalDate, parseAsShanghaiTime } from "@/lib/dateUtils";

export async function getFixedPromotionRules(userId: string, endDate: Date, shopName?: string) {
  try {
    return await prisma.fixedPromotionExpense.findMany({
      where: { userId, effectiveDate: { lte: endDate }, ...(shopName ? { shopName } : {}) },
      orderBy: { effectiveDate: "asc" },
    });
  } catch (error) {
    // 尚未升级表结构的环境仍可读取原有推广记录。
    if (isPrismaMissingTableError(error, "FixedPromotionExpense")) return [];
    throw error;
  }
}

export async function getEffectivePromotionExpenses(userId: string, startDate: Date, endDate: Date, shopName?: string, includeFuture = false) {
  const [manual, rules] = await Promise.all([
    prisma.dailyPromotionExpense.findMany({ where: { userId, date: { gte: startDate, lte: endDate }, ...(shopName ? { shopName } : {}) } }),
    getFixedPromotionRules(userId, endDate, shopName),
  ]);
  return mergeFixedPromotionExpenses(manual, rules, startDate, endDate, formatLocalDate(new Date()), includeFuture);
}

export async function getAllEffectivePromotionExpenses(userId: string) {
  const today = formatLocalDate(new Date());
  const endDate = parseAsShanghaiTime(`${today} 23:59:59`);
  const [manual, rules] = await Promise.all([
    prisma.dailyPromotionExpense.findMany({ where: { userId }, orderBy: { date: "asc" } }),
    getFixedPromotionRules(userId, endDate),
  ]);
  const dates = [...manual.map((item) => item.date), ...rules.map((rule) => rule.effectiveDate)];
  if (!dates.length) return [];
  const start = new Date(Math.min(...dates.map((date) => date.getTime())));
  return mergeFixedPromotionExpenses(manual, rules, start, endDate).reverse();
}
