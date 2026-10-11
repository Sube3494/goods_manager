// 公司扣点先按分舍入，订单剩余收入减去同一笔扣点，避免两边分别舍入。
export function resolveCompanyCommission(expectedIncome: number, rate: number) {
  const incomeCents = Math.round(expectedIncome * 100);
  const commissionCents = Math.round(incomeCents * rate);
  return {
    commission: commissionCents / 100,
    retainedIncomeCents: incomeCents - commissionCents,
  };
}
