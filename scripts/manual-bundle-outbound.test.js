import { beforeEach, expect, mock, test } from "bun:test";

let created;
let deducted;
let products;
let order;
const accessory = (id) => ({ id, shopProductId: id, name: id, quantity: 2 });
const tx = {
  user: { findUnique: async () => ({ permissions: [] }) },
  shopProduct: {
    findMany: async () => products,
    findFirst: async () => products[0],
    findUnique: async ({ where }) => products.find((p) => p.id === where.id),
  },
  purchaseOrderItem: {
    aggregate: async ({ where, _sum }) => ({ _sum: _sum.remainingQuantity
      ? { remainingQuantity: where.shopProductId === "removed" ? 0 : 20 }
      : { quantity: 0 } }),
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
  processOutboundFIFO: async (_tx, _user, items) => {
    deducted = items;
    return items.map(() => ({ totalCost: 10 }));
  },
} }));
mock.module("../src/lib/storage", () => ({ getStorageStrategy: async () => ({ resolveUrl: (url) => url }) }));
const { createOutboundFromAutoPickOrder } = await import("../src/lib/autoPickOrders");

beforeEach(() => {
  created = null;
  deducted = null;
  products = ["main", "kept", "removed"].map((id) => ({
    id, productId: null, sourceProductId: null, productName: id, sku: id, stock: id === "removed" ? 0 : 20,
    shop: { id: "shop-1", name: "测试店" },
  }));
  products[0].isBundle = true;
  products[0].bundleItems = [accessory("kept"), accessory("removed")];
  order = {
    id: "order-1", userId: "user-1", platform: "美团", orderNo: "bundle-order", status: "已完成",
    actualPaid: 10000, orderTime: new Date(),
    rawPayload: { systemMeta: { resolvedShop: { id: "shop-1", name: "测试店" } } },
    items: [{ productName: "main", productNo: "main", quantity: 3, rawPayload: {
      manualBundleItemsOverride: true,
      manualMatchedProduct: {
        id: "main", shopProductId: "main", name: "main", sourceType: "shopProduct",
        isManual: false, matchMethod: "sku", isBundle: false, bundleItems: [],
      },
    } }],
  };
});

test("移除部分固定配件后，只校验并扣减本体及保留配件", async () => {
  Object.assign(order.items[0].rawPayload.manualMatchedProduct, { isBundle: true, bundleItems: [accessory("kept")] });
  expect(await createOutboundFromAutoPickOrder("user-1", "order-1")).toMatchObject({ ok: true });
  expect(deducted.map(({ shopProductId, quantity }) => ({ shopProductId, quantity }))).toEqual([
    { shopProductId: "main", quantity: 3 }, { shopProductId: "kept", quantity: 6 },
  ]);
  expect(created.items.create).toHaveLength(2);
});

test("移除全部固定配件后，空清单不恢复商品库配置", async () => {
  expect(await createOutboundFromAutoPickOrder("user-1", "order-1")).toMatchObject({ ok: true });
  expect(deducted).toHaveLength(1);
  expect(created.items.create[0]).toMatchObject({ shopProductId: "main", quantity: 3 });
});

test("历史订单显式保存空配件清单时，也不恢复固定配件", async () => {
  delete order.items[0].rawPayload.manualBundleItemsOverride;
  expect(await createOutboundFromAutoPickOrder("user-1", "order-1")).toMatchObject({ ok: true });
  expect(deducted).toHaveLength(1);
});

test("未手动调整配件的订单继续校验固定配置中的缺货配件", async () => {
  delete order.items[0].rawPayload.manualBundleItemsOverride;
  delete order.items[0].rawPayload.manualMatchedProduct.bundleItems;
  delete order.items[0].rawPayload.manualMatchedProduct.isBundle;
  expect(await createOutboundFromAutoPickOrder("user-1", "order-1")).toMatchObject({
    ok: false, reason: "insufficient-stock",
    insufficientItems: [expect.objectContaining({ shopProductId: "removed", quantity: 6 })],
  });
  expect(deducted).toBeNull();
  expect(created).toBeNull();
});
