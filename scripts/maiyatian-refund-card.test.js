import { expect, mock, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
mock.module("../src/components/ui/Toast", () => ({ useToast: () => ({ showToast: () => {} }) }));
const { OrderCard, OrderStatusProfitPreview, getOrderProfitPreviewItems } = await import("../src/app/orders/OrderCard");

test("买两件退一件仍可悬停预估利润，成本仅计剩余一件", () => {
  const order = { status: "配送中", platform: "美团", actualPaid: 73010, expectedIncome: 34319,
    refundAmount: 36500, hasOutbound: false, items: [{ quantity: 2,
      rawPayload: { number: 2, part_refund_title: "已退款1件" },
      displayItems: [{ name: "玩偶", quantity: 2, costPrice: 60 }] }] };
  const items = getOrderProfitPreviewItems(order);
  expect(items[0].quantity).toBe(1);
  expect(items.reduce((sum, item) => sum + item.quantity * item.costPrice, 0)).toBe(60);
  const render = (value, canViewProductCosts = true) => renderToStaticMarkup(React.createElement(OrderStatusProfitPreview,
    { order: value, canViewProductCosts }, React.createElement("span", null, "配送中")));
  expect(render(order)).toContain("查看当前订单利润");
  expect(render({ ...order, refundAmount: 73010 })).not.toContain("查看当前订单利润");
  expect(render(order, false)).not.toContain("查看当前订单利润");
  expect(render({ ...order, items: [{ ...order.items[0], displayItems: [{ name: "玩偶", quantity: 2 }] }] })).not.toContain("查看当前订单利润");
  const bundle = getOrderProfitPreviewItems({ ...order, items: [{ ...order.items[0], displayItems: [
    { name: "主商品", quantity: 2, costPrice: 60 }, { name: "配件", quantity: 4, costPrice: 5 },
  ] }] });
  expect(bundle.map((item) => item.quantity)).toEqual([1, 2]);
});

test("退款订单卡片保留原实付，展示退款后到手及商品退款原因", () => {
  const item = { productName: "保温杯", productNo: "B31", quantity: 5, rawPayload: { id: "10469227", number: 5, part_refund_title: "已退款2件" } };
  const order = { id: "order-1", platform: "美团", orderNo: "test-order", dailyPlatformSequence: 2,
    status: "已完成", orderTime: "2026-10-11T05:21:00Z", userAddress: "测试地址", distanceIsLinear: false,
    actualPaid: 66110, expectedIncome: 37290, platformCommission: 2380, refundAmount: 26440, items: [item],
    rawPayload: { cancelDetails: [{ id: "2", source_cancel_id: "refund-1", status: "1", title: "确认退款", reason: "改数量", total_price: 264.4,
      goods_format: JSON.stringify([{ order_goods_id: "10469227", number: 2 }]) }] } };
  const noop = () => {};
  const html = renderToStaticMarkup(React.createElement(OrderCard, { order, expanded: false, actingId: "",
    onToggleExpanded: noop, onRunAction: noop, onOpenCostBackfill: noop, onOpenMatchEditor: noop }));
  expect(html).toMatch(/实付<\/span><span[^>]*>¥661\.10/);
  expect(html).toContain("¥372.90");
  expect(html).toContain("¥23.80");
  expect(html).toContain("¥264.40");
  expect(html).toContain("改数量 · 退款 ¥264.40");
  expect(html).toContain("2/5 件");
});
