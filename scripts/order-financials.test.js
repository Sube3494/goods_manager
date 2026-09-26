import assert from "node:assert/strict";
import {
  hasExplicitDeliveryPickupProof,
  readConfirmedRefundAmountFromRawPayload,
  resolveCancelledOrderPureProfit,
} from "../src/lib/orderFinancials.ts";

assert.equal(
  hasExplicitDeliveryPickupProof(
    { track: "等待骑手接单", pickupTime: "2026-09-25 20:07:00" },
    { delivery_time: "2026-09-25 20:07:00" },
  ),
  false,
  "等待接单时显示的取餐时间不能证明骑手已取货",
);

assert.equal(
  hasExplicitDeliveryPickupProof(
    { track: "抢单成功", pickupTime: "2026-09-25 12:36:00" },
    { delivery: { pickup_time: "2026-09-25 19:20:40" } },
  ),
  false,
  "抢单成功和计划取餐时间不能证明骑手已取货",
);

assert.equal(
  hasExplicitDeliveryPickupProof({ track: "骑手已取货" }),
  true,
  "明确已取货轨迹应视为配送费已发生证据",
);

assert.equal(
  hasExplicitDeliveryPickupProof({ track: "配送中" }),
  true,
  "进入配送中阶段应视为骑手已经取货",
);

assert.equal(
  readConfirmedRefundAmountFromRawPayload({
    cancelDetails: [{ status: 0, total_price: "129.10" }],
  }),
  0,
  "退款申请不能显示为已退款",
);

assert.equal(
  readConfirmedRefundAmountFromRawPayload({
    cancelDetails: [{ status: 0, total_price: "129.10" }, { status: 1, total_price: "129.10" }],
  }),
  12910,
  "确认退款应按分返回退款金额",
);

assert.equal(
  resolveCancelledOrderPureProfit(0, 0),
  null,
  "取消且没有实际损失时不应显示零利润",
);

assert.equal(
  resolveCancelledOrderPureProfit(1586, 0),
  -1586,
  "骑手已取货并产生配送费时应显示负利润",
);

console.log("order financial regression tests passed");
