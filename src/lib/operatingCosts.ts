export type OperatingCostProfileLike = {
  shopName?: string | null;
  monthlyRent?: number | null;
  monthlyLabor?: number | null;
  allocationBaseDays?: number | null;
};

export type OperatingCostMonthlyBillLike = {
  shopName?: string | null;
  monthKey: string;
  waterAmount?: number | null;
  electricAmount?: number | null;
  sharedElectricAmount?: number | null;
  propertyFeeAmount?: number | null;
};

export function normalizeMonthKey(value: string | Date) {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})/);
  if (!match) {
    return normalizeMonthKey(new Date());
  }
  return `${match[1]}-${match[2]}`;
}

export function normalizeOperatingCostShopName(value: string | null | undefined) {
  return String(value || "").trim();
}

export function getDaysInMonthKey(monthKey: string) {
  const normalized = normalizeMonthKey(monthKey);
  const [yearText, monthText] = normalized.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return 30;
  }
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function getDailyFixedOperatingCost(profile: OperatingCostProfileLike | null | undefined) {
  const monthlyRent = Number(profile?.monthlyRent || 0);
  const monthlyLabor = Number(profile?.monthlyLabor || 0);
  const allocationBaseDays = Math.max(1, Number(profile?.allocationBaseDays || 30));
  return (monthlyRent + monthlyLabor) / allocationBaseDays;
}

export function getDailyUtilityCost(bill: OperatingCostMonthlyBillLike | null | undefined) {
  if (!bill) return 0;
  const waterAmount = Number(bill.waterAmount || 0);
  const electricAmount = Number(bill.electricAmount || 0);
  const sharedElectricAmount = Number(bill.sharedElectricAmount || 0);
  const propertyFeeAmount = Number(bill.propertyFeeAmount || 0);
  const days = getDaysInMonthKey(bill.monthKey);
  return (waterAmount + electricAmount + sharedElectricAmount + propertyFeeAmount) / Math.max(1, days);
}
