import { getDefaultAutoPickSelfDeliveryTimingConfig } from "@/lib/autoPickOrders";
import { parseAsShanghaiTime } from "@/lib/dateUtils";
import { AutoPickSelfDeliveryTimingConfig } from "@/lib/types";

export type SchedulableAutoPickOrder = {
  orderTime: Date | string;
  distanceKm?: number | null;
  deliveryDeadline?: string | null;
};

function getSelfDeliveryTimingConfig(config?: Partial<AutoPickSelfDeliveryTimingConfig> | null) {
  const defaults = getDefaultAutoPickSelfDeliveryTimingConfig();
  return {
    pickupMinutes: typeof config?.pickupMinutes === "number" ? config.pickupMinutes : defaults.pickupMinutes,
    minutesPerKm: typeof config?.minutesPerKm === "number" ? config.minutesPerKm : defaults.minutesPerKm,
    riderUpstairsMinutes: typeof config?.riderUpstairsMinutes === "number" ? config.riderUpstairsMinutes : defaults.riderUpstairsMinutes,
    deadlineLeadMinutes: typeof config?.deadlineLeadMinutes === "number" ? config.deadlineLeadMinutes : defaults.deadlineLeadMinutes,
  };
}

export function parseExpectedDeliveryTime(deadlineText: string | null | undefined, orderTime: Date | string) {
  const text = String(deadlineText || "").replace(/\s+/g, " ").trim();
  if (!text) return null;

  const dateTimeMatch = text.match(/(?:(\d{4})[-/.年])?(\d{1,2})[-/.月](\d{1,2})日?\s+(\d{1,2}):(\d{2})(?::\d{2})?/);
  const timeMatch = dateTimeMatch ? null : text.match(/(?:今日|今天|明日|明天|后日|后天)?\s*(\d{1,2}:\d{2})/);
  if (!dateTimeMatch && !timeMatch) return null;

  const baseDate = parseAsShanghaiTime(orderTime);
  const candidate = new Date(baseDate);
  candidate.setSeconds(0, 0);

  if (dateTimeMatch) {
    const year = dateTimeMatch[1] ? Number(dateTimeMatch[1]) : baseDate.getFullYear();
    const month = Number(dateTimeMatch[2]);
    const day = Number(dateTimeMatch[3]);
    const hours = Number(dateTimeMatch[4]);
    const minutes = Number(dateTimeMatch[5]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return null;
    }

    candidate.setFullYear(year, month - 1, day);
    candidate.setHours(hours, minutes, 0, 0);
    if (!dateTimeMatch[1] && candidate.getTime() < baseDate.getTime() - 60 * 1000) {
      candidate.setFullYear(year + 1);
    }
    return candidate.getTime() > Date.now() ? candidate : null;
  }

  if (!timeMatch) return null;

  const [hours, minutes] = timeMatch[1].split(":").map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  candidate.setHours(hours, minutes, 0, 0);

  if (/明日|明天/.test(text)) {
    candidate.setDate(candidate.getDate() + 1);
  } else if (/后日|后天/.test(text)) {
    candidate.setDate(candidate.getDate() + 2);
  } else if ((/今日|今天/.test(text) || !/明日|明天|后日|后天/.test(text)) && candidate.getTime() < baseDate.getTime() - 60 * 1000) {
    candidate.setDate(candidate.getDate() + 1);
  }

  if (candidate.getTime() <= Date.now()) {
    return null;
  }

  return candidate;
}

export function getEstimatedAutoCompleteAt(order: SchedulableAutoPickOrder, config?: Partial<AutoPickSelfDeliveryTimingConfig> | null) {
  const timing = getSelfDeliveryTimingConfig(config);
  const distanceKm = typeof order.distanceKm === "number" ? order.distanceKm : null;
  const heuristicAt = distanceKm != null
    ? new Date(Date.now() + (timing.pickupMinutes + distanceKm * timing.minutesPerKm + timing.riderUpstairsMinutes) * 60 * 1000)
    : null;

  const expectedAt = parseExpectedDeliveryTime(order.deliveryDeadline, order.orderTime);
  const latestSafeAt = expectedAt
    ? new Date(expectedAt.getTime() - timing.deadlineLeadMinutes * 60 * 1000)
    : null;

  // 主逻辑按配置的取货/路程/送达时长计算，但如果会晚于预计送达前的安全时间，就向前截断。
  if (heuristicAt && latestSafeAt) {
    return heuristicAt.getTime() <= latestSafeAt.getTime() ? heuristicAt : latestSafeAt;
  }

  if (heuristicAt) {
    return heuristicAt;
  }

  if (latestSafeAt) {
    return latestSafeAt;
  }

  return null;
}
