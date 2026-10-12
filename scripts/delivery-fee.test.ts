import assert from "node:assert/strict";
import { isDeliveryCancelledOrEmpty, readDeliveryFeeFromValue } from "../src/lib/autoPickOrderStatus";

// 麦芽田 send_fee 是平台最终展示金额，premium_fee 是其中的费用构成，不能重复相加。
assert.equal(
  readDeliveryFeeFromValue(
    { sendFee: 1605 },
    { delivery: { send_fee: "1385", premium_fee: "220", tip: "0" } }
  ),
  1385
);

assert.equal(
  readDeliveryFeeFromValue({ send_fee: "1385", premium_fee: "220" }),
  1385
);

// 骑手小费不包含在 send_fee 中，需要额外计入最终配送支出。
assert.equal(
  readDeliveryFeeFromValue({ send_fee: "614", tip: "200", premium_fee: "0" }),
  814
);

// 历史标准化值错误时，以原始载荷重新计算基础配送费与小费。
assert.equal(
  readDeliveryFeeFromValue(
    { sendFee: 614 },
    { delivery: { send_fee: "614", tip: "200", premium_fee: "0" } }
  ),
  814
);

// 缺少最终费用字段时，才允许用独立费用构成兜底。
assert.equal(
  readDeliveryFeeFromValue({ premium_fee: "220" }),
  220
);

assert.equal(
  readDeliveryFeeFromValue({ logisticName: "自配送", send_fee: "1385" }),
  0
);

// 运单取消不代表费用已退回，仍需保留平台费用及小费。
for (const cancellation of [
  { track: "运单已取消" },
  { track: "配送退单" },
  { cancel_time: "2026-10-12 13:00:00" },
  { cancelTime: "2026-10-12 13:00:00" },
  { status: "99" },
]) {
  const delivery = { logisticName: "闪送", send_fee: "1385", tip: "200", ...cancellation };
  assert.equal(isDeliveryCancelledOrEmpty({ delivery }), true);
  assert.equal(readDeliveryFeeFromValue(delivery), 1585);
  // 历史标准化值已被清零时，从原始载荷恢复。
  assert.equal(readDeliveryFeeFromValue({ ...delivery, send_fee: undefined, sendFee: 0 }, { delivery }), 1585);
}

assert.equal(readDeliveryFeeFromValue({ track: "已取消", sendFee: 0 }), 0);
assert.equal(readDeliveryFeeFromValue({ track: "已取消", logisticName: "自配送", sendFee: 1385 }), 0);
assert.equal(readDeliveryFeeFromValue({ track: "已取消", manualDeliveryFee: 500 }), 500);
assert.equal(readDeliveryFeeFromValue(
  { track: "已取消", logisticName: "自配送" },
  { systemMeta: { manualDeliveryFee: { deliveryFee: 500 } } },
), 500);

console.log("delivery fee tests passed");
