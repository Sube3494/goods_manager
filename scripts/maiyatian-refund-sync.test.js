import { afterEach, expect, mock, test } from "bun:test";
mock.module("../src/lib/prisma", () => ({ default: {
  autoPickOrder: { findFirst: async () => ({ id: "existing-order", customerRemark: "existing", rawPayload: { cancelReason: "确认退款：改数量" }, items: [] }) },
} }));
const { enrichAutoPickInboundOrderIfNeeded } = await import("../src/lib/autoPickOrders");
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("同步实际请求两个接口，将缓存的取消态修正为配送中并保存退款详情", async () => {
  const goods = { id: "10469227", goods_id: "73042968", goods_name: "测试保温杯", sku_code: "B31", number: "5",
    show_part_refund_tag: 1, part_refund_title: "已退款2件" };
  const refund = { id: "1109058862", source_cancel_id: "86596309843", status: "1", title: "确认退款", reason: "改数量", total_price: 264.4,
    goods_format: JSON.stringify([{ order_goods_id: "10469227", sku_code: "B31", number: 2 }]) };
  const details = { id: "13244231622", source_id: "2902339360014790397", status: "delivering", is_cancel: 1, finished_time: "",
    fee: { user_fee: "66110", shop_fee: "62237", commission: "3973" }, goods: [goods], delivery: { track: "配送中", status: "40", finished_time: "0" } };
  const paths = [];
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(String(url));
    paths.push(parsed.pathname);
    expect(options.headers.get("Cookie")).toBe("test-session");
    expect(parsed.searchParams.get("id")).toBe("13244231622");
    const data = parsed.pathname === "/order/detail/" ? details
      : parsed.pathname === "/cancel/detail/" ? [{ ...refund, id: "1109058848", status: "0", title: "发起退款" }, refund] : {};
    return Response.json({ errno: 1, message: "", data });
  };
  const result = await enrichAutoPickInboundOrderIfNeeded("user-1", {
    id: "13244231622", orderNo: "2902339360014790397", platform: "美团", status: "已取消",
    actualPaid: 66110, cancelReason: "确认退款：改数量",
  }, "test-session");
  expect(paths).toContain("/order/detail/");
  expect(paths).toContain("/cancel/detail/");
  expect(result.status).toBe("配送中");
  expect(result.actualPaid).toBe(66110);
  expect(result.refundAmount).toBe(26440);
  expect(result.items[0].quantity).toBe(5);
  expect(result.rawPayload.cancelDetails).toHaveLength(2);
});
