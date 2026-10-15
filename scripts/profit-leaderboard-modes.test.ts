import assert from "node:assert/strict";
import { rankLeaderboardProfits } from "../src/lib/profitLeaderboardDeductions";

const rows = [
  { id: "a", name: "甲", email: "a@example.test", profit: 1002.75, pureProfit: 1002.75, rank: 1, deductions: { promotionExpense: 20, brushExpense: 23.33, operatingExpense: 300 } },
  { id: "b", name: "乙", email: "b@example.test", profit: 800, pureProfit: 800, rank: 2, deductions: { promotionExpense: 0, brushExpense: 0, operatingExpense: 0 } },
];
const orders = rankLeaderboardProfits(rows, "order");
assert.equal(orders[0].profit, 1002.75);
assert.equal(orders[0].id, "a");
const total = rankLeaderboardProfits(rows, "total");
assert.equal(total[0].id, "b", "Changing the metric recalculates the ranking");
assert.equal(total[1].profit, 659.42, "Total profit deducts each additional expense exactly once");
assert.equal(rankLeaderboardProfits(total, "order")[0].profit, 1002.75, "Switching back restores order profit");
assert.equal(rankLeaderboardProfits(total, "total")[1].profit, 659.42, "Repeated rendering does not deduct twice");
assert.equal(rows[0].profit, 1002.75, "Cached data is not mutated");
const ties = rankLeaderboardProfits([rows[1], { ...rows[1], id: "c" }], "total");
assert.deepEqual(ties.map(row => row.rank), [1, 1]);
const loss = rankLeaderboardProfits([{ ...rows[0], pureProfit: 10 }], "total");
assert.equal(loss[0].profit, -333.33);
console.log("PASS: order/total metrics, reranking, ties, losses, cache immutability and no double deductions");
