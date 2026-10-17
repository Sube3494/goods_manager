import { beforeEach, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { buildOutboundReturnMetaNote, repairBrushInventoryReturnNote } from "../src/lib/outboundReturnMeta";
import { getOrderGroup } from "../src/lib/orderGroups";

let viewer;
let cookieValid;
let autoCompleteCalls;
let orderReads;
let outbounds;
let orderQueries;
const order = {
  id: "order-1", userId: "member-1", orderNo: "TEST-PROFIT", platform: "线下交易", status: "已完成",
  orderTime: new Date("2026-10-15T04:00:00Z"), actualPaid: 100275, expectedIncome: 100275,
  platformCommission: 0, rawPayload: {}, delivery: null, items: [], shopId: null, shopAddress: null,
  createdAt: new Date("2026-10-15T04:00:00Z"), updatedAt: new Date("2026-10-15T04:00:00Z"),
};
const integration = { maiyatianCookie: "test-cookie" };
const dbModel = new Proxy({}, { get: (_, method) => async () => method === "count" ? 0 : method === "findUnique" || method === "findFirst" ? null : [] });
const db = new Proxy({
  user: { findUnique: async () => ({ permissions: { autoPickIntegration: integration }, shippingAddresses: [] }) },
  autoPickOrder: {
    findMany: async (query) => { orderReads++; orderQueries.push(query); return [order]; },
    count: async (query) => { orderQueries.push(query); return 1; },
  },
  outboundOrder: { findMany: async () => outbounds },
}, { get: (target, name) => target[name] || dbModel });
mock.module("../src/lib/prisma", () => ({ default: db }));
mock.module("../src/lib/auth", () => ({
  getAuthorizedAdmin: async () => viewer,
  getAuthorizedUser: async () => viewer,
  getAuthorizedUserAny: async () => viewer,
}));
mock.module("../src/lib/storage", () => ({ getStorageStrategy: async () => ({ resolveUrl: value => value }) }));
mock.module("../src/lib/autoPickAutoComplete", () => ({ processDueAutoCompleteJobs: async () => { autoCompleteCalls++; } }));
const autoPick = await import("../src/lib/autoPickOrders");
mock.module("../src/lib/autoPickOrders", () => ({
  ...autoPick,
  getAutoPickIntegrationConfigByUserId: async () => ({ ...integration, maiyatianCookies: [] }),
  testMaiyatianCookieConnection: async () => ({ ok: cookieValid }),
}));
const { GET } = await import("../src/app/api/orders/route");

beforeEach(() => {
  viewer = { id: "admin", role: "SUPER_ADMIN", email: "admin@example.test" };
  cookieValid = true;
  autoCompleteCalls = 0;
  orderReads = 0;
  orderQueries = [];
  outbounds = [];
  order.rawPayload = {};
  order.platform = "线下交易";
});

test("订单列表、总数和汇总查询排除已删除订单，搜索筛选也不能重新带出", async () => {
  const response = await GET(new NextRequest("http://localhost/api/orders?userId=member-1&_metrics=1&query=TEST&status=已取消"));
  expect(response.status).toBe(200);
  expect(orderQueries.length).toBeGreaterThan(0);
  for (const query of orderQueries) {
    const where = JSON.stringify(query.where);
    expect(where).toContain('"NOT":{"OR":[{"status":{"contains":"删除"');
    expect(where).toContain('"equals":"delete"');
    expect(where).toContain('"equals":"deleted"');
  }
});

test("排行榜直接复用今日看板纯利润汇总，并将分转换为元", async () => {
  const dashboard = await GET(new NextRequest("http://localhost/api/orders?userId=member-1&_metrics=1&startDate=2026-10-15&endDate=2026-10-15"));
  expect(dashboard.status).toBe(200);
  const dashboardData = await dashboard.json();
  const response = await GET(new NextRequest("http://localhost/api/orders?_leaderboard=1&userId=member-1&startDate=2026-10-15&endDate=2026-10-15"));
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data).toEqual({ eligible: true, pureProfit: 1002.75 });
  expect(data.pureProfit).toBe(dashboardData.summary.pureProfit / 100);
});

test("仅麦芽田数据权限即可读榜单，且不返回订单、成本或触发自动完成", async () => {
  viewer = { id: "viewer", role: "USER", permissions: { "members:orders": true } };
  const response = await GET(new NextRequest("http://localhost/api/orders?_leaderboard=1&userId=member-1"));
  expect(await response.json()).toEqual({ eligible: true, pureProfit: 1002.75 });
  expect(autoCompleteCalls).toBe(0);
});

test("无麦芽田权限不能绕过排行榜接口", async () => {
  viewer = { id: "viewer", role: "USER", permissions: { "members:manage": true } };
  const response = await GET(new NextRequest("http://localhost/api/orders?_leaderboard=1&userId=member-1"));
  expect(response.status).toBe(403);
  expect(orderReads).toBe(0);
});

test("凭证无效的成员不参与排名且无需读取订单", async () => {
  cookieValid = false;
  const response = await GET(new NextRequest("http://localhost/api/orders?_leaderboard=1&userId=member-1"));
  expect(await response.json()).toEqual({ eligible: false, status: "invalid" });
  expect(orderReads).toBe(0);
});

test("真实订单查询在刷单退库修复后归回刷单，清除虚假退款且不再显示已出库", async () => {
  order.platform = "美团";
  order.rawPayload = { systemMeta: { mainSystemSelfDelivery: { triggered: true, manuallyMarked: true }, autoOutbound: { status: "skipped", error: "brush-order-no-auto-outbound" } } };
  outbounds = [{ id: "out-1", status: "Returned", note: buildOutboundReturnMetaNote("平台单号: TEST-PROFIT", [{
    id: "return-1", createdAt: "2026-10-15T10:23:50Z", reason: "售后退货", refundAmount: 1002.75, extraExpense: 0, returnedCost: 42.2,
    items: [{ outboundOrderItemId: "item-1", quantity: 1 }],
  }], "Returned"), items: [{ id: "item-1", quantity: 1, productId: null, shopProductId: null, costSnapshot: null }] }];
  const read = async () => {
    const response = await GET(new NextRequest("http://localhost/api/orders?userId=member-1&startDate=2026-10-15&endDate=2026-10-15"));
    expect(response.status).toBe(200);
    return (await response.json()).items[0];
  };
  const before = await read();
  expect(before.refundAmount).toBe(100275);
  expect(getOrderGroup(before, true)).toBe("closed");
  outbounds[0].note = repairBrushInventoryReturnNote(outbounds[0].note, "Returned");
  const after = await read();
  expect(after.refundAmount).toBe(0);
  expect(after.status).toBe("已完成");
  expect(after.hasOutbound).toBe(false);
  expect(getOrderGroup(after, true)).toBe("brush");
});
