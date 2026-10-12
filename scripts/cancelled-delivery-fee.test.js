import { afterEach, expect, mock, test } from "bun:test";
mock.module("../src/lib/prisma", () => ({ default: {
  autoPickOrder: { findFirst: async () => null },
} }));
const { normalizeAutoPickOrderPayload, enrichAutoPickInboundOrderIfNeeded } = await import("../src/lib/autoPickOrders");
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const delivery = { logistic_name: "闪送", track: "运单已取消", cancel_time: "2026-10-12 13:00:00", send_fee: "1385", tip: "200" };

test("取消通知标准化保留平台配送费与小费", () => {
  const order = normalizeAutoPickOrderPayload({ id: "cancelled-order", orderNo: "test-order", platform: "淘宝", status: "已取消", delivery,
    orderTime: "2026-10-12 12:47:00", userAddress: "测试地址", items: [{ productName: "测试商品", quantity: 1 }] });
  expect(order.delivery.sendFee).toBe(1585);
  expect(order.delivery.track).toBe("运单已取消");
});

test("同步取消订单详情保留费用，不将取消运单当作自配", async () => {
  globalThis.fetch = async (url) => {
    const path = new URL(String(url)).pathname;
    return Response.json({ errno: 1, message: "", data: path === "/order/detail/"
      ? { id: "cancelled-order", source_id: "test-order", status: "cancel", channel_tag: "taobao", delivery,
          fee: { user_fee: "14800", shop_fee: "14060" }, goods: [] }
      : [] });
  };
  const order = await enrichAutoPickInboundOrderIfNeeded("user-1", {
    id: "cancelled-order", orderNo: "test-order", platform: "淘宝", status: "已取消", actualPaid: 14800,
  }, "test-session");
  expect(order.delivery.sendFee).toBe(1585);
  expect(order.delivery.logisticName).toBe("闪送");
});
