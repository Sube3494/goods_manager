import { beforeEach, expect, mock, test } from "bun:test";

let created;
let deducted;
let products;
let order;
let hasOldOutbound;
let returned;
const accessory = (id) => ({ id, shopProductId: id, name: id, quantity: 2 });
const tx = {
  autoPickOrderItem: { update: async ({ data }) => { order.items[0].rawPayload = data.rawPayload; } },
  user: { findUnique: async () => ({ permissions: [] }) },
  product: { findMany: async () => [] },
  shopProduct: {
    findMany: async ({ where } = {}) => where?.OR
      ? products.filter((p) => where.OR.some((condition) => condition.sku === p.sku || condition.jdSkuId === p.jdSkuId && p.jdSkuId))
      : products,
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
const db = {
  ...tx,
  autoPickOrderItem: {
    findFirst: async () => ({ ...order.items[0], order }),
  },
  autoPickOrder: { findFirst: async () => order },
  outboundOrder: { findMany: async () => hasOldOutbound
    ? [{ id: "old-outbound", note: "平台单号: bundle-order", status: "Completed" }]
    : [] },
  $transaction: async (callback) => callback(tx),
};
mock.module("../src/lib/prisma", () => ({ default: db }));
mock.module("../src/lib/catalogPrisma", () => ({ default: db }));
mock.module("../src/lib/auth", () => ({ getAuthorizedUser: async () => ({ id: "user-1" }) }));
mock.module("../src/lib/outboundReturns", () => ({ returnOutboundOrderById: async () => {
  hasOldOutbound = false;
  returned++;
} }));
mock.module("../src/services/inventoryService", () => ({ InventoryService: {
  processOutboundFIFO: async (_tx, _user, items) => {
    deducted = items;
    return items.map(() => ({ totalCost: 10 }));
  },
} }));
mock.module("../src/lib/storage", () => ({ getStorageStrategy: async () => ({ resolveUrl: (url) => url }) }));
const { createOutboundFromAutoPickOrder } = await import("../src/lib/autoPickOrders");
const { PATCH } = await import("../src/app/api/orders/[id]/items/[itemId]/match/route");
const remove = (currentBundleItems) => PATCH(new Request("http://localhost/api/orders/order-1/items/item-1/match", {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ removeComponentIndex: 1, currentBundleItems }),
}), { params: Promise.resolve({ id: "order-1", itemId: "item-1" }) });

beforeEach(() => {
  created = null;
  deducted = null;
  hasOldOutbound = false;
  returned = 0;
  products = ["main", "kept", "removed"].map((id) => ({
    id, shopId: "shop-1", productId: null, sourceProductId: null, productName: id, sku: id, stock: id === "removed" ? 0 : 20,
    shop: { id: "shop-1", name: "测试店" },
  }));
  products[0].isBundle = true;
  products[0].bundleItems = [accessory("kept"), accessory("removed")];
  order = {
    id: "order-1", userId: "user-1", platform: "美团", orderNo: "bundle-order", status: "已完成",
    actualPaid: 10000, orderTime: new Date(),
    rawPayload: { systemMeta: { resolvedShop: { id: "shop-1", name: "测试店" } } },
    items: [{ id: "item-1", productName: "main", productNo: "main", quantity: 3, rawPayload: {
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
  expect(created.items.create.map((item) => item.costSnapshot.salesQuantity)).toEqual([3, 0]);
});

test("移除全部固定配件后，空清单不恢复商品库配置", async () => {
  expect(await createOutboundFromAutoPickOrder("user-1", "order-1")).toMatchObject({ ok: true });
  expect(deducted).toHaveLength(1);
  expect(created.items.create[0]).toMatchObject({ shopProductId: "main", quantity: 3 });
  expect(created.items.create[0].costSnapshot.salesQuantity).toBe(3);
});

test("同商品同时作为配件和单品售出时，只记录单品销量", async () => {
  Object.assign(order.items[0].rawPayload.manualMatchedProduct, { isBundle: true, bundleItems: [accessory("kept")] });
  order.items.push({
    id: "item-2", productName: "kept", productNo: "kept", quantity: 2,
    rawPayload: { manualMatchedProduct: { id: "kept", shopProductId: "kept", sourceType: "shopProduct", isBundle: false, bundleItems: [] } },
  });
  expect(await createOutboundFromAutoPickOrder("user-1", "order-1")).toMatchObject({ ok: true });
  expect(created.items.create.find((item) => item.shopProductId === "kept")).toMatchObject({
    quantity: 8, costSnapshot: { salesQuantity: 2 },
  });
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

test("旧页面移除接口保留商品关联，把整单展示数量还原成每份数量，并重建出库", async () => {
  hasOldOutbound = true;
  const response = await remove([
    { name: "kept", sku: "kept", quantity: 6 },
    { name: "removed", sku: "removed", quantity: 6 },
  ]);
  expect(response.status).toBe(200);
  expect(returned).toBe(1);
  expect(order.items[0].rawPayload.manualMatchedProduct.bundleItems).toEqual([
    expect.objectContaining({ shopProductId: "kept", quantity: 2 }),
  ]);
  expect(deducted.map(({ shopProductId, quantity }) => ({ shopProductId, quantity }))).toEqual([
    { shopProductId: "main", quantity: 3 }, { shopProductId: "kept", quantity: 6 },
  ]);
});

test("修复前已保存的无关联配件重新出库时恢复数量与店铺关联", async () => {
  Object.assign(order.items[0].rawPayload.manualMatchedProduct, {
    isBundle: true, bundleItems: [{ name: "kept", sku: "kept", quantity: 6 }],
  });
  expect(await createOutboundFromAutoPickOrder("user-1", "order-1")).toMatchObject({ ok: true });
  expect(deducted[1]).toMatchObject({ shopProductId: "kept", quantity: 6 });
});

test("新版页面传递每份配件配置，移除后再移除不会重复放大数量", async () => {
  hasOldOutbound = true;
  expect((await remove([accessory("kept"), accessory("removed")])).status).toBe(200);
  expect(deducted[1]).toMatchObject({ shopProductId: "kept", quantity: 6 });
  hasOldOutbound = true;
  const response = await PATCH(new Request("http://localhost/api/orders/order-1/items/item-1/match", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ removeComponentIndex: 0,
      currentBundleItems: order.items[0].rawPayload.manualMatchedProduct.bundleItems }),
  }), { params: Promise.resolve({ id: "order-1", itemId: "item-1" }) });
  expect(response.status).toBe(200);
  expect(deducted).toHaveLength(1);
  expect(deducted[0]).toMatchObject({ shopProductId: "main", quantity: 3 });
  expect(order.items[0].rawPayload.manualMatchedProduct.bundleItems).toEqual([]);
});

test("保留配件无法关联时，移除接口不保存且不退回旧出库", async () => {
  hasOldOutbound = true;
  const originalPayload = order.items[0].rawPayload;
  // 按 SKU 查询没有匹配项。
  const findMany = db.shopProduct.findMany;
  db.shopProduct.findMany = async () => [];
  try {
    expect((await remove([
      { name: "missing", sku: "missing", quantity: 3 },
      { name: "removed", sku: "removed", quantity: 6 },
    ])).status).toBe(500);
    expect(returned).toBe(0);
    expect(order.items[0].rawPayload).toBe(originalPayload);
  } finally {
    db.shopProduct.findMany = findMany;
  }
});

function setCopiedComposite(entry) {
  products.unshift({
    id: "original", shopId: "other-shop", productId: null, sourceProductId: "shared-source",
    productName: "原商品", sku: "original", stock: 20,
    shop: { id: "other-shop", name: "原店铺" },
  });
  products.find((p) => p.id === "kept").sourceProductId = "shared-source";
  Object.assign(order.items[0].rawPayload.manualMatchedProduct, {
    id: "main+kept", shopProductId: "main+kept", isCompositeMatch: true,
    compositeItems: [entry], bundleItems: [],
  });
}

test("复制商品重新组合匹配后，只扣当前店铺明确选择的商品", async () => {
  setCopiedComposite({ id: "kept", shopProductId: "kept", productId: "shared-source", quantity: 2 });
  expect(await createOutboundFromAutoPickOrder("user-1", "order-1")).toMatchObject({ ok: true });
  expect(deducted).toEqual([expect.objectContaining({ shopProductId: "kept", quantity: 2 })]);
});

test("同店多个复制商品共享来源时，明确选择的 ID 优先于来源匹配", async () => {
  setCopiedComposite({ shopProductId: "kept", productId: "shared-source", quantity: 2 });
  products.find((p) => p.id === "main").sourceProductId = "shared-source";
  expect(await createOutboundFromAutoPickOrder("user-1", "order-1")).toMatchObject({ ok: true });
  expect(deducted[0].shopProductId).toBe("kept");
});

test("历史组合保留原店铺 ID 时，通过来源唯一关联当前店铺副本", async () => {
  setCopiedComposite({ shopProductId: "original", quantity: 2 });
  expect(await createOutboundFromAutoPickOrder("user-1", "order-1")).toMatchObject({ ok: true });
  expect(deducted[0].shopProductId).toBe("kept");
});

test("当前店铺没有对应副本时，不回退扣减原店铺库存", async () => {
  setCopiedComposite({ shopProductId: "original", quantity: 2 });
  products.find((p) => p.id === "kept").sourceProductId = null;
  await expect(createOutboundFromAutoPickOrder("user-1", "order-1")).rejects.toThrow("无法唯一关联当前店铺商品");
  expect(deducted).toBeNull();
  expect(created).toBeNull();
});

test("当前店铺有多个同来源副本时，要求重新选择具体商品", async () => {
  setCopiedComposite({ shopProductId: "original", quantity: 2 });
  products.find((p) => p.id === "main").sourceProductId = "shared-source";
  await expect(createOutboundFromAutoPickOrder("user-1", "order-1")).rejects.toThrow("无法唯一关联当前店铺商品");
  expect(deducted).toBeNull();
  expect(created).toBeNull();
});
