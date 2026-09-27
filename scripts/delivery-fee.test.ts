import assert from "node:assert/strict";
import { readDeliveryFeeFromValue } from "../src/lib/autoPickOrderStatus";

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

// 缺少最终费用字段时，才允许用独立费用构成兜底。
assert.equal(
  readDeliveryFeeFromValue({ premium_fee: "220" }),
  220
);

assert.equal(
  readDeliveryFeeFromValue({ logisticName: "自配送", send_fee: "1385" }),
  0
);

console.log("delivery fee tests passed");
