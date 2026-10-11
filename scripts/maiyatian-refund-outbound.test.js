import { beforeEach, expect, mock, test } from "bun:test";

let stock;
let created;
let deducted;
const product = { id: "sp-1", productId: null, sourceProductId: null, productName: "杯子", sku: "B31", stock: 3,
  shop: { id: "shop-1", name: "白云店" } };
const goods = { id: "10469227", number: 5, sku_code: "B31", part_refund_title: "已退款2件",
  manualMatchedProduct: { id: "sp-1", shopProductId: "sp-1", name: "杯子", sourceType: "shopProduct", quantity: 5 } };
const order = { id: "order-1", userId: "user-1", platform: "美团", orderNo: "order-number", status: "已完成", actualPaid: 66110,
  orderTime: new Date(), items: [{ productName: "杯子", productNo: "B31", quantity: 5, rawPayload: goods }],
  rawPayload: { systemMeta: { resolvedShop: { id: "shop-1", name: "白云店" } },
    cancelDetails: [{ status: "1", title: "确认退款", source_cancel_id: "refund-1", total_price: 264.4,
      goods_format: JSON.stringify([{ order_goods_id: "10469227", number: 2 }]) }] } };
const tx = {
  user: { findUnique: async () => ({ permissions: [] }) },
  shopProduct: { findMany: async () => [product], findFirst: async () => product, findUnique: async () => product },
  purchaseOrderItem: {
    aggregate: async ({ _sum }) => ({ _sum: _sum.remainingQuantity ? { remainingQuantity: stock } : { quantity: 0 } }),
    findMany: async () => [],
  },
  outboundOrder: { create: async ({ data }) => { created = data; return { id: "outbound-1" }; } },
};
mock.module("../src/lib/prisma", () => ({ default: {
  autoPickOrder: { findFirst: async () => order },
  outboundOrder: { findMany: async () => [] },
  $transaction: async (callback) => callback(tx),
} }));
mock.module("../src/services/inventoryService", () => ({ InventoryService: {
  processOutboundFIFO: async (_tx, _user, items) => { deducted = items; return items.map(() => ({ totalCost: 210 })); },
} }));
mock.module("../src/lib/storage", () => ({ getStorageStrategy: async () => ({ resolveUrl: (url) => url }) }));
const { createOutboundFromAutoPickOrder } = await import("../src/lib/autoPickOrders");
beforeEach(() => { stock = 3; created = null; deducted = null; });

test("库存只有3件时，5件退2件的订单可出库，FIFO和出库单只处理3件", async () => {
  expect(await createOutboundFromAutoPickOrder("user-1", "order-1")).toMatchObject({ ok: true, outboundOrderId: "outbound-1" });
  expect(deducted).toHaveLength(1);
  expect(deducted[0].quantity).toBe(3);
  expect(created.items.create[0].quantity).toBe(3);
  expect(order.items[0].quantity).toBe(5);
});

test("缺货提示只计算未退款的3件需求，不要求补齐已退的2件", async () => {
  stock = 2;
  const result = await createOutboundFromAutoPickOrder("user-1", "order-1");
  expect(result).toMatchObject({ ok: false, reason: "insufficient-stock" });
  expect(result.insufficientItems[0]).toMatchObject({ quantity: 3, availableQuantity: 2, missingQuantity: 1 });
  expect(deducted).toBeNull();
  expect(created).toBeNull();
});
