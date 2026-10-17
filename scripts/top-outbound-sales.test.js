import { expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

const order = { id: "order", date: new Date(), status: "Normal", note: "平台单号: 123" };
const mainProduct = { id: "main", productName: "组合商品", sku: "main", bundleItems: [{ shopProductId: "oil", quantity: 2 }] };
const oilProduct = { id: "oil", productName: "Zippo打火机燃油133ml", sku: "oil" };
mock.module("../src/lib/prisma", () => ({ default: {
  outboundOrderItem: { findMany: async () => [
    { id: "main-row", shopProductId: "main", quantity: 3, shopProduct: mainProduct, outboundOrder: order },
    { id: "oil-row", shopProductId: "oil", quantity: 6, shopProduct: oilProduct, outboundOrder: order },
    { id: "standalone", shopProductId: "oil", quantity: 2, shopProduct: oilProduct, outboundOrder: { ...order, id: "other-order" } },
    { id: "custom-accessory", shopProductId: "gift", quantity: 5, shopProduct: { id: "gift", productName: "定制商品" }, costSnapshot: { salesQuantity: 0 }, outboundOrder: order },
  ] },
} }));
mock.module("../src/lib/auth", () => ({ getFreshSession: async () => ({ id: "user" }) }));
mock.module("../src/lib/storage", () => ({ getStorageStrategy: async () => ({ resolveUrl: (url) => url }) }));
const { GET } = await import("../src/app/api/stats/top-outbound/route");

test("热销接口剔除随组合出库的燃油，保留其他订单单独售出的燃油", async () => {
  const response = await GET(new NextRequest("http://localhost/api/stats/top-outbound?range=7d"));
  expect(response.status).toBe(200);
  const items = await response.json();
  expect(items.map((item) => [item.shopProductId, item.totalQuantity]))
    .toEqual([["main", 3], ["oil", 2]]);
});
