export type DashboardDateRange = { rangePreset: string; startDate: string; endDate: string };

export const dashboardDateRangeKey = (userId: string) => `dashboard:date-range:v1:${userId}`;

const validDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export function presetDashboardDateRange(preset: string, today: string): DashboardDateRange {
  const date = new Date(`${today}T00:00:00Z`);
  let endDate = today;
  switch (preset) {
    case "today": break;
    case "yesterday": date.setUTCDate(date.getUTCDate() - 1); endDate = date.toISOString().slice(0, 10); break;
    case "month": date.setUTCDate(1); break;
    case "lastMonth":
      date.setUTCDate(0);
      endDate = date.toISOString().slice(0, 10);
      date.setUTCDate(1);
      break;
    case "all": break;
    case "7d": case "15d": case "30d": case "90d":
      date.setUTCDate(date.getUTCDate() - (Number.parseInt(preset, 10) - 1));
      break;
    default: return presetDashboardDateRange("all", today);
  }
  return { rangePreset: preset, startDate: date.toISOString().slice(0, 10), endDate };
}

export function restoreDashboardDateRange(saved: string | null, today: string): DashboardDateRange {
  try {
    const value = JSON.parse(saved || "null");
    if (value?.version !== 1) return presetDashboardDateRange("all", today);
    if (value.rangePreset === "7d") return presetDashboardDateRange("all", today);
    if (value.rangePreset !== "custom") return presetDashboardDateRange(value.rangePreset, today);
    if (validDate(value.startDate) && validDate(value.endDate) && value.startDate <= value.endDate) {
      return { rangePreset: "custom", startDate: value.startDate > today ? today : value.startDate, endDate: value.endDate > today ? today : value.endDate };
    }
  } catch { /* Corrupt or outdated preferences fall back to the default range. */ }
  return presetDashboardDateRange("all", today);
}

export function serializeDashboardDateRange(range: DashboardDateRange): string {
  return JSON.stringify(range.rangePreset === "custom"
    ? { version: 1, ...range }
    : { version: 1, rangePreset: range.rangePreset });
}
