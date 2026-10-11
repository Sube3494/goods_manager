import { expect, test } from "bun:test";
import { resolveCompanyCommission } from "../src/lib/companyCommission";

test("扣点恰好半分时，净收入减去已舍入扣点，不单独舍入净收入", () => {
  const result = resolveCompanyCommission(1.25, 0.06);
  expect(result).toEqual({ commission: 0.08, retainedIncomeCents: 117 });
  expect(Math.round(125 * (1 - 0.06))).toBe(118);
});

test("逐单扣点汇总和逐单净收入汇总能够按分对账", () => {
  const incomes = [1.25, 2.25, 12.5, 23.75, 999.99];
  let incomeCents = 0;
  let commissionCents = 0;
  let retainedCents = 0;
  for (const income of incomes) {
    const result = resolveCompanyCommission(income, 0.06);
    incomeCents += Math.round(income * 100);
    commissionCents += Math.round(result.commission * 100);
    retainedCents += result.retainedIncomeCents;
  }
  expect(retainedCents).toBe(incomeCents - commissionCents);
});

test("无公司扣点的线下订单保留完整收入", () => {
  expect(resolveCompanyCommission(12.35, 0)).toEqual({ commission: 0, retainedIncomeCents: 1235 });
});
