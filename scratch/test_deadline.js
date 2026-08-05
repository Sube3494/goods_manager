const assert = require('assert');

function isJdOrder(platform, channelTag) {
  const p = String(platform || "").trim().toLowerCase();
  const c = String(channelTag || "").trim().toLowerCase();
  return p === "jd" || p.includes("jingdong") || p.includes("jddj") || p.includes("京东") || c === "daojia";
}

function getDeadlineDisplay(order) {
  const deadlineText = String(order.deliveryDeadline || "").trim();
  const rangeText = String(order.deliveryTimeRange || "").trim();
  const text = order.isPickup ? (rangeText || deadlineText) : (rangeText || deadlineText);
  if (!text) return "-";
  if (!/\d{1,2}:\d{2}/.test(text)) return "-";
  if (order.isPickup) return text;

  // 尝试提取规范的年-月-日日期前缀
  let datePrefix = "";
  const dateSource = deadlineText || String(order.orderTime || "") || String(order.createdAt || "");
  const dateMatch = dateSource.match(/^(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2})/);
  if (dateMatch) {
    datePrefix = dateMatch[0] + " ";
  }

  // 自动补齐秒级（如果只有 HH:mm 格式，补齐为 HH:mm:00）
  const ensureSeconds = (val) => {
    const trimmed = val.trim();
    if (/\b\d{1,2}:\d{2}$/.test(trimmed)) {
      return trimmed + ":00";
    }
    return trimmed;
  };

  const isJd = isJdOrder(order.platform, order.channelTag);

  // 优先匹配标准时间段: HH:mm-HH:mm 或 HH:mm:ss~HH:mm:ss 等
  const rangeMatch = text.match(/(\d{1,2}:\d{2}(?::\d{2})?)\s*[-~至]\s*(\d{1,2}:\d{2}(?::\d{2})?)/);
  if (rangeMatch) {
    const startTime = rangeMatch[1];
    const endTime = rangeMatch[2];
    const targetTime = isJd ? endTime : startTime;
    return ensureSeconds(`${datePrefix}${targetTime}`);
  }

  // 备用 fallback：按连字符分隔
  const parts = text.split(/\s*[-~至]\s*/);
  if (parts.length > 1) {
    const targetSegment = isJd ? parts[parts.length - 1].trim() : parts[0].trim();
    const timeMatch = targetSegment.match(/\d{1,2}:\d{2}(:\d{2})?/);
    if (timeMatch) {
      return ensureSeconds(`${datePrefix}${timeMatch[0]}`);
    }
    return ensureSeconds(`${datePrefix}${targetSegment}`);
  }

  // 兜底：如果只是单一时间，抓取时分并拼接日期前缀
  const timeMatch = text.match(/\d{1,2}:\d{2}(:\d{2})?/);
  if (timeMatch) {
    return ensureSeconds(`${datePrefix}${timeMatch[0]}`);
  }

  const firstTimeMatch = text.match(/^(.*?\d{1,2}:\d{2})/);
  return firstTimeMatch?.[1] ? ensureSeconds(firstTimeMatch[1].trim()) : "-";
}

// 测试 1：美团订单 + 时间段 "16:26-17:26" -> 读开始时间 16:26
const meituanOrder = {
  platform: "美团",
  deliveryTimeRange: "16:26-17:26",
  orderTime: "2026-07-27 15:08:00"
};
assert.strictEqual(getDeadlineDisplay(meituanOrder), "2026-07-27 16:26:00");

// 测试 2：京东订单 + 时间段 "16:26-17:26" -> 读结束时间 17:26
const jdOrder = {
  platform: "京东",
  deliveryTimeRange: "16:26-17:26",
  orderTime: "2026-07-27 15:08:00"
};
assert.strictEqual(getDeadlineDisplay(jdOrder), "2026-07-27 17:26:00");

// 测试 3：淘宝订单 + 时间段 "07-27 15:00-16:00" -> 读开始时间 15:00
const tbOrder = {
  platform: "淘宝闪购",
  deliveryTimeRange: "07-27 15:00-16:00",
  orderTime: "2026-07-27 14:00:00"
};
assert.strictEqual(getDeadlineDisplay(tbOrder), "2026-07-27 15:00:00");

// 测试 4：抖音订单 + 时间段 "15:00~16:00" -> 读开始时间 15:00
const dyOrder = {
  platform: "抖音超市",
  deliveryTimeRange: "15:00~16:00",
  orderTime: "2026-07-27 14:00:00"
};
assert.strictEqual(getDeadlineDisplay(dyOrder), "2026-07-27 15:00:00");

// 测试 5：京东订单 + 时间段 "07-27 15:00至16:00" -> 读结束时间 16:00
const jdOrder2 = {
  platform: "京东秒送",
  deliveryTimeRange: "07-27 15:00至16:00",
  orderTime: "2026-07-27 14:00:00"
};
assert.strictEqual(getDeadlineDisplay(jdOrder2), "2026-07-27 16:00:00");

console.log("所有测试用例成功通过！");
