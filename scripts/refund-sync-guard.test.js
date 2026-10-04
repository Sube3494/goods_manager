const assert = require("assert");

// 模拟 isOrderFullyRefunded 的逻辑
function isOrderFullyRefunded(order) {
  if (!order) return false;
  if (order.outboundMeta?.isFullyReturned === true) return true;
  const statusText = String(order.status || "").trim();
  if (/已退款|全额退款|退款成功|全部退款/.test(statusText)) return true;

  const rawPayloadObj = order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)
    ? order.rawPayload
    : null;
  const rawRefundAmount = rawPayloadObj ? Number(rawPayloadObj.refundAmount ?? rawPayloadObj.refund_amount) : 0;
  const actualPaid = Math.max(0, Number(order.actualPaid || (rawPayloadObj?.actualPaid ?? rawPayloadObj?.actual_paid) || 0));
  const refundAmount = Math.max(0, Number(order.refundAmount || (Number.isFinite(rawRefundAmount) && rawRefundAmount > 0 ? rawRefundAmount : 0)));

  if (actualPaid > 0 && refundAmount >= actualPaid) {
    return true;
  }
  const expectedIncome = order.expectedIncome != null ? Number(order.expectedIncome) : (rawPayloadObj?.expectedIncome != null ? Number(rawPayloadObj.expectedIncome) : null);
  if (expectedIncome === 0 && actualPaid > 0 && refundAmount > 0) {
    return true;
  }
  return false;
}

// 模拟京东送达后退款订单
const jdOrder = {
  id: "jd-order-1",
  orderNo: "338870388371",
  platform: "京东",
  status: "已取消",
  actualPaid: 8882, // 88.82 元
  expectedIncome: 0,
  rawPayload: {
    refundAmount: 8882,
    cancelReason: "买家申请退款：协商一致退款",
    systemMeta: {},
  },
};

// 1. 验证 isOrderFullyRefunded 能正确判定
assert.strictEqual(isOrderFullyRefunded(jdOrder), true, "京东已取消退款订单应判定为全额退款");

// 2. 模拟从麦芽田同步刷新回来的数据（麦芽田由于送达可能返回 finish/已完成，但带或不带退款信息）
const incomingSyncedWithoutRefund = {
  status: "已完成", // 平台查到已送达返回了已完成
  actualPaid: 8882,
  refundAmount: undefined,
};

// 状态保护逻辑
const existingOrder = jdOrder;
const existingRefundAmount = jdOrder.rawPayload.refundAmount;
const isExistingCancelled = existingOrder.status === "已取消";
const isExistingFullyRefunded = isOrderFullyRefunded(existingOrder);

const nextRefundAmount = incomingSyncedWithoutRefund.refundAmount || existingRefundAmount;
const shouldKeepCancelledForRefunded = (isExistingCancelled || isExistingFullyRefunded)
  && Boolean(nextRefundAmount && nextRefundAmount > 0)
  && incomingSyncedWithoutRefund.status === "已完成";

assert.strictEqual(shouldKeepCancelledForRefunded, true, "同步时全额退款/已取消订单必须被保护，不允许变成已完成");

console.log("refund sync guard tests passed!");
