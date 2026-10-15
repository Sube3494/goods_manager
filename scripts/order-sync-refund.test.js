import { expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
let lookup;
let cancelledJobs = 0;
let outboundCalls = 0;
let clearedBrushMarkers = 0;
const rawPayload = { goods: [{ id: "10469227", number: "5", part_refund_title: "已退款2件" }],
  cancelDetails: [{ source_cancel_id: "86596309843", status: "1", title: "确认退款", total_price: 264.4 }] };
const refreshedOrder = { id: "local-order", userId: "user-1", sourceId: "13244231622", orderNo: "2902339360014790397",
  platform: "美团", status: "配送中", actualPaid: 66110, expectedIncome: 62237, platformCommission: 3973,
  rawPayload, delivery: { track: "配送中" }, items: [], shopAddress: null };
mock.module("../src/lib/auth", () => ({ getAuthorizedUser: async () => ({ id: "user-1", permissions: [] }) }));
mock.module("../src/lib/prisma", () => ({ default: {
  autoPickOrder: { findFirst: async () => ({ ...refreshedOrder, status: "已取消" }) },
  user: { findUnique: async () => ({ permissions: [] }) },
} }));
mock.module("../src/lib/autoPickOrders", () => ({
  refreshAutoPickOrderFromPlugin: async (userId, query) => { lookup = { userId, ...query }; return refreshedOrder; },
  backfillPersistedAutoPickOrderFields: async () => ({ count: 0 }),
  backfillPlatformIdsForSyncedAutoPickOrder: async () => ({ count: 0, details: [] }),
  clearAutoPickOrderMainSystemSelfDelivery: async () => { clearedBrushMarkers++; },
  normalizeAutoPickOrderPayload: () => null,
  readCustomerMaskedPhoneFromRawPayload: () => "",
  readCustomerNameFromRawPayload: () => "",
  readCustomerPhoneExtensionFromRawPayload: () => "",
  readCustomerPhoneFromRawPayload: () => "",
  readCustomerTypeFromRawPayload: () => "",
  readCancelReasonFromRawPayload: () => "确认退款：改数量",
  readRiderPhoneFromDelivery: () => "",
  readRiderPhoneFromRawPayload: () => "",
  readShopNameFromRawPayload: () => "",
  resolveAutoPickCommandPlatform: () => "meituan",
  resolveAutoPickMatchedShopName: () => "",
  syncAutoOutboundFromCompletedAutoPickOrder: async () => { outboundCalls++; },
  syncBrushOrderFromCompletedAutoPickOrder: async () => {},
}));
mock.module("../src/lib/autoPickAutoComplete", () => ({ cancelAutoCompleteJob: async () => { cancelledJobs++; } }));
const { POST } = await import("../src/app/api/orders/[id]/sync/route");

test("单笔同步返回恢复后的配送状态、退款和6%佣金到手", async () => {
  const result = await POST(new NextRequest("http://localhost/api/orders/local-order/sync", { method: "POST" }), {
    params: Promise.resolve({ id: "local-order" }),
  });
  expect(result.status).toBe(200);
  const data = await result.json();
  expect(lookup).toMatchObject({ userId: "user-1", id: "13244231622", orderNo: "2902339360014790397" });
  expect(data.order).toMatchObject({ status: "配送中", actualPaid: 66110, refundAmount: 26440, expectedIncome: 37290, platformCommission: 2380 });
  expect(cancelledJobs).toBe(0);
  expect(outboundCalls).toBe(0);
});

test("单笔同步不会清除人工刷单标记，也不会返回跳回普通订单的状态", async () => {
  const previousRaw = refreshedOrder.rawPayload;
  const previousDelivery = refreshedOrder.delivery;
  clearedBrushMarkers = 0;
  refreshedOrder.rawPayload = { ...previousRaw, systemMeta: { mainSystemSelfDelivery: { triggered: true, manuallyMarked: true } } };
  refreshedOrder.delivery = { logisticName: "闪送", dispatcher: "rider-1", sendFee: 1280 };
  try {
    const response = await POST(new NextRequest("http://localhost/api/orders/local-order/sync", { method: "POST" }), { params: Promise.resolve({ id: "local-order" }) });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.order.isMainSystemSelfDelivery).toBe(true);
    expect(clearedBrushMarkers).toBe(0);
    expect(data.order.delivery.logisticName).toBe("闪送");
    expect(data.order.delivery.sendFee).toBe(1280);
  } finally {
    refreshedOrder.rawPayload = previousRaw;
    refreshedOrder.delivery = previousDelivery;
  }
});
