import { FinanceMath } from "./math";
import type { LeaderboardResult } from "./profitLeaderboardCache";

export const LEADERBOARD_DEDUCTIONS = [
  { key: "promotionExpense", label: "推广费" },
  { key: "brushExpense", label: "独立刷单支出" },
  { key: "operatingExpense", label: "经营成本" },
] as const;

export type LeaderboardDeduction = typeof LEADERBOARD_DEDUCTIONS[number]["key"];
export type LeaderboardExpenses = Record<LeaderboardDeduction, number>;

export function rankLeaderboardProfits(rows: LeaderboardResult["rows"], mode: "order" | "total") {
  const ranked = rows.map(row => ({
    ...row,
    profit: FinanceMath.subtract(row.pureProfit ?? row.profit,
      mode === "total" ? FinanceMath.sum(...LEADERBOARD_DEDUCTIONS.map(({ key }) => row.deductions?.[key] ?? 0)) : 0),
  })).sort((a, b) => b.profit - a.profit || a.id.localeCompare(b.id));
  let rank = 1;
  return ranked.map((row, index) => {
    if (index > 0 && row.profit !== ranked[index - 1].profit) rank = index + 1;
    return { ...row, rank };
  });
}
