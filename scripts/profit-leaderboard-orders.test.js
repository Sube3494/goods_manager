import { beforeEach, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

let viewer;
let cookieValid;
let autoCompleteCalls;
let orderReads;
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
    findMany: async () => { orderReads++; return [order]; },
    count: async () => 1,
  },
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
