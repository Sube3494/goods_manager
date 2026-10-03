import { strict as assert } from "node:assert";
import { getOrderGroup } from "../src/lib/orderGroups";
import type { AutoPickOrder } from "../src/lib/types";

const group = (status: string, productCostStatus: AutoPickOrder["productCostStatus"], isBrush = false, hasOutbound = productCostStatus !== "pending-outbound") =>
  getOrderGroup({ status, productCostStatus, hasOutbound } as AutoPickOrder, isBrush);

assert.equal(group("待处理", "pending-outbound"), "pending");
assert.equal(group("配送中", "pending-outbound"), "pending");
assert.equal(group("已完成", "pending-outbound"), "outbound");
assert.equal(group("已完成", "ready"), "completed");
assert.equal(group("已完成", "ready", false, false), "outbound");
assert.equal(group("已完成", "pending-backfill"), "completed");
assert.equal(getOrderGroup({ status: "已完成" } as AutoPickOrder, false), "outbound");
assert.equal(group("配送中", "ready"), "pending");
assert.equal(group("已取消", "pending-outbound", true), "closed");
assert.equal(group("已删除", "pending-outbound"), "closed");
assert.equal(
  getOrderGroup(
    {
      status: "已完成",
      hasOutbound: false,
      productCostStatus: "ready",
      items: [
        {
          productName: "手工配送占位商品",
          productNo: "__manual_delivery_placeholder__",
          quantity: 1,
        },
      ],
    } as any,
    false
  ),
  "completed"
);
assert.equal(
  getOrderGroup(
    {
      status: "已完成",
      hasOutbound: false,
      productCostStatus: "pending-outbound",
      items: [
        {
          productName: "可口可乐",
          productNo: "COLA001",
          quantity: 1,
        },
      ],
    } as any,
    false
  ),
  "outbound"
);
console.log("Order group tests passed");

