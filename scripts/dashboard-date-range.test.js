import { expect, test } from "bun:test";
import { dashboardDateRangeKey, presetDashboardDateRange, restoreDashboardDateRange, serializeDashboardDateRange } from "../src/lib/dashboardDateRange";

test("预设只保存类型，重新打开按当天滚动日期", () => {
  const saved = serializeDashboardDateRange(presetDashboardDateRange("30d", "2026-10-11"));
  expect(JSON.parse(saved)).toEqual({ version: 1, rangePreset: "30d" });
  expect(restoreDashboardDateRange(saved, "2026-10-12")).toEqual({ rangePreset: "30d", startDate: "2026-09-13", endDate: "2026-10-12" });
});

test("今天、昨天、本月、上月处理跨年和闰年", () => {
  expect(presetDashboardDateRange("yesterday", "2026-01-01").endDate).toBe("2025-12-31");
  expect(presetDashboardDateRange("month", "2026-10-11").startDate).toBe("2026-10-01");
  expect(presetDashboardDateRange("lastMonth", "2024-03-01")).toEqual({ rangePreset: "lastMonth", startDate: "2024-02-01", endDate: "2024-02-29" });
  expect(presetDashboardDateRange("today", "2026-10-11").startDate).toBe("2026-10-11");
});

test("自定义保留日期，未来日期限制到当天", () => {
  const custom = { rangePreset: "custom", startDate: "2026-09-01", endDate: "2026-09-10" };
  expect(restoreDashboardDateRange(serializeDashboardDateRange(custom), "2026-10-11")).toEqual(custom);
  expect(restoreDashboardDateRange(serializeDashboardDateRange({ ...custom, endDate: "2026-12-01" }), "2026-10-11").endDate).toBe("2026-10-11");
});

test("无效、损坏和旧版记忆安全回退，账号使用独立键", () => {
  const fallback = presetDashboardDateRange("all", "2026-10-11");
  for (const value of [null, "broken", '{"version":2}', '{"version":1,"rangePreset":"unknown"}', serializeDashboardDateRange({ rangePreset: "custom", startDate: "2026-02-30", endDate: "2026-03-01" }), serializeDashboardDateRange({ rangePreset: "custom", startDate: "2026-10-10", endDate: "2026-10-01" })]) {
    expect(restoreDashboardDateRange(value, "2026-10-11")).toEqual(fallback);
  }
  expect(dashboardDateRangeKey("a")).not.toBe(dashboardDateRangeKey("b"));
});

test("旧的七天偏好迁移为全部，其余有效预设和自定义日期保留", () => {
  expect(restoreDashboardDateRange('{"version":1,"rangePreset":"7d"}', "2026-10-13"))
    .toEqual(presetDashboardDateRange("all", "2026-10-13"));
  expect(restoreDashboardDateRange(serializeDashboardDateRange(presetDashboardDateRange("all", "2026-10-12")), "2026-10-13"))
    .toEqual(presetDashboardDateRange("all", "2026-10-13"));
});
