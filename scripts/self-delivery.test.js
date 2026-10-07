import { beforeEach, expect, mock, test } from "bun:test";
import { isAutoPickOrderSelfDeliveryActive, isAutoPickOrderRiderAssigned, isDeliveryCancelledOrEmpty } from "../src/lib/autoPickOrderStatus";

let order;
let platformCalls;
mock.module("../src/lib/auth", () => ({
  getFreshSession: async () => ({ id: "user-1" }),
  getAuthorizedUser: async () => ({ id: "user-1" }),
}));
mock.module("../src/lib/prisma", () => ({ default: {
  autoPickOrder: { findFirst: async () => order, update: async ({ data }) => { Object.assign(order, data); return order; } },
} }));
mock.module("../src/lib/autoPickOrders", () => ({
  callAutoPickCommand: async (_userId, command) => {
    platformCalls++;
    if (command === "/complete-delivery") return { ok: true, status: 200, data: { success: true } };
    throw new Error("must not dispatch");
  },
  getAutoPickIntegrationConfigByUserId: async () => null,
  getDefaultAutoPickSelfDeliveryTimingConfig: () => ({}),
  markAutoPickOrderMainSystemSelfDelivery: async () => {},
  readShopAddressFromRawPayload: () => "",
  readShopIdFromRawPayload: () => "",
  readShopNameFromRawPayload: () => "",
  refreshAutoPickOrderFromPlugin: async () => order,
  resolveAutoPickCommandPlatform: () => "meituan",
  resolveShopSelfDeliveryTiming: () => ({}),
  syncAutoOutboundFromCompletedAutoPickOrder: async () => {},
  syncBrushOrderFromCompletedAutoPickOrder: async () => {},
}));
mock.module("../src/lib/autoPickAutoComplete", () => ({
  cancelAutoCompleteJob: async () => {}, ensureAutoCompleteJob: async () => {},
}));
mock.module("../src/lib/autoPickOrderEvents", () => ({ emitAutoPickOrderEvent: () => {} }));
const { POST } = await import("../src/app/api/orders/[id]/self-delivery/route");
const { POST: completeDelivery } = await import("../src/app/api/orders/[id]/complete-delivery/route");
beforeEach(() => {
  platformCalls = 0;
  order = { id: "order-1", userId: "user-1", status: "delivering", sourceId: "source-1",
    rawPayload: {}, delivery: { logisticName: "自配送", riderName: "自配送", pickupTime: "2026-10-07 16:38:35" } };
});

test("screenshot self-delivery remains active and is not a third-party rider", () => {
  expect(isDeliveryCancelledOrEmpty(order)).toBe(false);
  expect(isAutoPickOrderSelfDeliveryActive(order)).toBe(true);
  expect(isAutoPickOrderRiderAssigned(order)).toBe(false);
});
test("duplicate self-delivery is rejected before contacting the platform", async () => {
  const response = await POST(new Request("http://localhost"), { params: Promise.resolve({ id: order.id }) });
  expect(response.status).toBe(409);
  expect((await response.json()).error).toContain("不能发起自配");
  expect(platformCalls).toBe(0);
});
test("successful local self-delivery marker blocks duplicates while platform status is delayed", async () => {
  order.status = "pending_delivery";
  order.delivery = null;
  order.rawPayload = { delivery: false, systemMeta: { mainSystemSelfDelivery: { triggered: true } } };
  expect(isDeliveryCancelledOrEmpty(order)).toBe(false);
  expect(isAutoPickOrderSelfDeliveryActive(order)).toBe(true);
  expect((await POST(new Request("http://localhost"), { params: Promise.resolve({ id: order.id }) })).status).toBe(409);
  expect(platformCalls).toBe(0);
});
test("normalized self-delivery flag and raw logistic tag also identify active self-delivery", () => {
  for (const candidate of [
    { status: "pending_delivery", isMainSystemSelfDelivery: true, rawPayload: { delivery: false } },
    { status: "pending_delivery", rawPayload: { delivery: { logistic_tag: "oneself" } } },
    { status: "pending_delivery", delivery: { logistic_name: "商家自配" } },
  ]) expect(isAutoPickOrderSelfDeliveryActive(candidate)).toBe(true);
});
test("explicit cancellations still allow re-dispatch despite stale self-delivery fields", () => {
  for (const cancellation of [
    { delivery: { ...order.delivery, cancel_time: "2026-10-07 16:40:00" } },
    { delivery: { ...order.delivery, status: 99 } },
    { delivery: { ...order.delivery, track: "运单已取消" } },
    { rawPayload: { cancel: { is_cancel: "1" } } },
    { status: "异常" },
  ]) {
    const candidate = { ...order, ...cancellation };
    expect(isDeliveryCancelledOrEmpty(candidate)).toBe(true);
    expect(isAutoPickOrderSelfDeliveryActive(candidate)).toBe(false);
  }
});
test("orders without a delivery task remain eligible", () => {
  const candidate = { status: "pending_delivery", rawPayload: { delivery: false } };
  expect(isDeliveryCancelledOrEmpty(candidate)).toBe(true);
  expect(isAutoPickOrderSelfDeliveryActive(candidate)).toBe(false);
});
test("third-party delivering orders remain assigned", () => {
  const candidate = { status: "delivering", delivery: { logisticName: "闪送", riderName: "张师傅" } };
  expect(isDeliveryCancelledOrEmpty(candidate)).toBe(false);
  expect(isAutoPickOrderSelfDeliveryActive(candidate)).toBe(false);
  expect(isAutoPickOrderRiderAssigned(candidate)).toBe(true);
});
test("self-delivery started outside the main system can be completed manually", async () => {
  order.isMainSystemSelfDelivery = false;
  const response = await completeDelivery(new Request("http://localhost"), { params: Promise.resolve({ id: order.id }) });
  expect(response.status).toBe(200);
  expect(order.status).toBe("已完成");
  expect(platformCalls).toBe(1);
});
test("third-party and cancelled deliveries cannot be manually completed", async () => {
  for (const delivery of [
    { logisticName: "闪送", riderName: "张师傅" },
    { logisticName: "自配送", track: "已取消" },
  ]) {
    order.delivery = delivery;
    expect((await completeDelivery(new Request("http://localhost"), { params: Promise.resolve({ id: order.id }) })).status).toBe(409);
  }
  expect(platformCalls).toBe(0);
});
test("self-delivery cannot be completed before entering delivering status", async () => {
  order.status = "pending_delivery";
  expect((await completeDelivery(new Request("http://localhost"), { params: Promise.resolve({ id: order.id }) })).status).toBe(409);
  expect(platformCalls).toBe(0);
});
