import { beforeEach, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { hasOrderRefundState } from "../src/lib/orderFinancials";

let authorized = true;
let saved;
let order;
let linkedOutbounds;
let returnCalls;
let failReturn;
mock.module("../src/lib/auth", () => ({
  getAuthorizedUser: async () => authorized ? { id: "user-1", name: "tester", permissions: [] } : null,
  getAuthorizedUserAny: async () => null,
}));
const db = {
  $queryRaw: async () => [],
  outboundOrder: { findMany: async () => linkedOutbounds.filter(outbound => outbound.status !== "Returned") },
  brushOrder: { deleteMany: async () => ({ count: 1 }) },
  autoPickOrder: {
    findFirst: async () => order,
    update: async ({ data }) => { saved = data; return { ...order, ...data }; },
  },
  $transaction: async (callback) => callback(db),
};
mock.module("../src/lib/prisma", () => ({ default: db }));
mock.module("../src/lib/autoPickOrders", () => ({
  getAutoPickIntegrationConfigByUserId: async () => null,
  normalizeAutoPickOrderPayload: () => null,
  readCustomerMaskedPhoneFromRawPayload: () => "",
  readCustomerNameFromRawPayload: () => "",
  readCustomerPhoneFromRawPayload: () => "",
  readCustomerPhoneExtensionFromRawPayload: () => "",
  readCustomerRemarkFromRawPayload: () => "",
  readAdminRemarkFromRawPayload: () => "",
  readCustomerTypeFromRawPayload: () => "",
  readCancelReasonFromRawPayload: () => "",
  readRiderPhoneFromDelivery: () => "",
  readRiderPhoneFromRawPayload: () => "",
  readAutoPickSystemMeta: (raw) => raw?.systemMeta || {},
  readOrderExtraExpensesFromRawPayload: () => [],
  calculateOrderTotalExtraExpense: () => 0,
  resolveAutoPickMatchedShopName: () => "",
  createOutboundFromAutoPickOrder: async () => ({ ok: false }),
  updateAutoPickOrderAutoOutboundState: async () => {},
  syncAutoOutboundFromCompletedAutoPickOrder: async () => {},
  syncBrushOrderFromCompletedAutoPickOrder: async () => {},
}));
mock.module("../src/lib/outboundReturns", () => ({ returnOutboundOrderById: async (userId, id, input, tx) => {
  if (failReturn) throw new Error("退库失败");
  returnCalls.push({ userId, id, input, tx });
  const outbound = linkedOutbounds.find(value => value.id === id);
  if (outbound) outbound.status = "Returned";
} }));
mock.module("../src/lib/autoPickAutoComplete", () => ({ cancelAutoCompleteJob: async () => {} }));
const { PATCH } = await import("../src/app/api/orders/[id]/route");
const patch = (expectedIncome) => PATCH(new NextRequest("http://localhost/api/orders/order-1", {
  method: "PATCH", body: JSON.stringify({ expectedIncome }), headers: { "Content-Type": "application/json" },
}), { params: Promise.resolve({ id: "order-1" }) });

beforeEach(() => {
  authorized = true;
  saved = null;
  linkedOutbounds = [];
  returnCalls = [];
  failReturn = false;
  order = { id: "order-1", orderNo: "1001", platform: "京东", status: "已取消",
    actualPaid: 10000, expectedIncome: 8500, platformCommission: 1500, items: [],
    rawPayload: { cancelDetails: [{ status: 1, title: "确认退款", total_price: 0 }] } };
});

test("京东退款不再额外开放到手编辑", async () => {
  expect(hasOrderRefundState(order)).toBe(true);
  const result = await patch(6500);
  expect(result.status).toBe(400);
  expect(saved).toBeNull();
});
test("美团退款到手由系统计算，直接调用接口也不能覆盖", async () => {
  order.platform = "美团";
  expect((await patch(0)).status).toBe(400);
  expect(saved).toBeNull();
});
test("原有抖店金额编辑权限保留", async () => {
  order.platform = "抖店";
  expect((await patch(6500)).status).toBe(200);
  expect(saved?.expectedIncome).toBe(6500);
});
test("原有线下金额编辑权限保留", async () => {
  order.platform = "线下交易";
  expect((await patch(6500)).status).toBe(200);
  expect(saved?.expectedIncome).toBe(6500);
  expect(saved?.actualPaid).toBe(6500);
});
test("普通京东订单仍保留自动抓取限制", async () => {
  order.rawPayload = {};
  expect((await patch(6500)).status).toBe(400);
  expect(saved).toBeNull();
});
test("已撤销的退款不放开京东到手编辑", async () => {
  order.rawPayload.cancelDetails = [
    { source_cancel_id: "refund-1", status: 1, title: "确认退款", total_price: 0 },
    { source_cancel_id: "refund-1", status: 3, title: "取消退款申请", total_price: 0 },
  ];
  expect((await patch(6500)).status).toBe(400);
});
test("负数到手拒绝保存", async () => {
  expect((await patch(-1)).status).toBe(400);
  expect(saved).toBeNull();
});
test("没有订单管理权限不能修改", async () => {
  authorized = false;
  expect((await patch(6500)).status).toBe(401);
  expect(saved).toBeNull();
});

test("手动标记刷单持久化独立标识，取消时明确清除", async () => {
  for (const enabled of [true, false]) {
    const response = await PATCH(new NextRequest("http://localhost/api/orders/order-1", {
      method: "PATCH", body: JSON.stringify({ isMainSystemSelfDelivery: enabled }), headers: { "Content-Type": "application/json" },
    }), { params: Promise.resolve({ id: "order-1" }) });
    expect(response.status).toBe(200);
    expect(saved.rawPayload.systemMeta.mainSystemSelfDelivery).toMatchObject({ triggered: enabled, manuallyMarked: enabled });
  }
});

test("标记刷单仅退回同账号同单号出库，重复请求不重复退库", async () => {
  linkedOutbounds = [
    { id: "exact", status: "Completed", note: "平台单号: 1001 | 自动出库" },
    { id: "prefix", status: "Completed", note: "平台单号: 10010 | 自动出库" },
    { id: "returned", status: "Returned", note: "平台单号: 1001 | 自动出库" },
  ];
  for (let index = 0; index < 2; index++) {
    const response = await PATCH(new NextRequest("http://localhost/api/orders/order-1", {
      method: "PATCH", body: JSON.stringify({ isMainSystemSelfDelivery: true }), headers: { "Content-Type": "application/json" },
    }), { params: Promise.resolve({ id: "order-1" }) });
    expect(response.status).toBe(200);
  }
  expect(returnCalls.length).toBe(1);
  expect(returnCalls[0].id).toBe("exact");
  expect(returnCalls[0].tx).toBe(db);
  expect(returnCalls[0].input.reason).toContain("自动回滚旧出库");
});

test("退库失败时不保存刷单标记", async () => {
  linkedOutbounds = [{ id: "exact", status: "Completed", note: "平台单号: 1001" }];
  failReturn = true;
  const response = await PATCH(new NextRequest("http://localhost/api/orders/order-1", {
    method: "PATCH", body: JSON.stringify({ isMainSystemSelfDelivery: true }), headers: { "Content-Type": "application/json" },
  }), { params: Promise.resolve({ id: "order-1" }) });
  expect(response.status).toBe(500);
  expect(saved).toBeNull();
});
