import { beforeEach, expect, mock, test } from "bun:test";

let remaining;
let created;
let transactionCalls;
let failCreate;
let shopProduct;
let legacyBatch;
const batch = () => ({
  id: "batch-1", quantity: 30, remainingQuantity: remaining, costPrice: 2.26,
  shopProduct: { shopId: shopProduct.shopId },
  purchaseOrder: { shippingFees: 0, extraFees: 0, items: [] },
});
const matchesBatch = (where) => where.OR.some((condition) => legacyBatch
  ? condition.productId === "sp-1" && condition.shopProductId === null
  : condition.shopProductId === "sp-1");
const tx = {
  shopProduct: {
    findUnique: async () => shopProduct,
    update: async () => ({}),
  },
  purchaseOrderItem: {
    findFirst: async ({ where }) => where.id === "batch-1" && matchesBatch(where) ? batch() : null,
    findMany: async ({ where }) => matchesBatch(where) ? [batch()] : [],
    updateMany: async ({ where, data }) => {
      const qty = data.remainingQuantity.decrement;
      if (remaining < where.remainingQuantity.gte) return { count: 0 };
      remaining -= qty;
      return { count: 1 };
    },
    aggregate: async () => ({ _sum: { remainingQuantity: remaining } }),
  },
  productBatch: { updateMany: async () => ({ count: 0 }), findMany: async () => [] },
  outboundOrder: {
    create: async ({ data }) => {
      if (failCreate) throw new Error("simulated create failure");
      for (const item of data.items.create) {
        if (item.productId !== null) throw new Error("invalid master product foreign key");
      }
      created = data;
      return { id: "outbound-1" };
    },
  },
};
mock.module("../src/lib/auth", () => ({
  getFreshSession: async () => ({ id: "user-1" }),
  getAuthorizedUser: async () => ({ id: "user-1" }),
}));
mock.module("../src/lib/prisma", () => ({ default: {
  shop: { findFirst: async ({ where }) => where.id === "shop-1" ? { id: "shop-1", name: "南山店" } : null },
  shopProduct: { findMany: async ({ where }) => where.id.in.includes("sp-1") ? [shopProduct] : [] },
  $transaction: async (callback) => {
    transactionCalls++;
    const previous = remaining;
    try { return await callback(tx); }
    catch (error) { remaining = previous; throw error; }
  },
} }));
const { POST } = await import("../src/app/api/outbound/route");
const submit = (overrides = {}) => POST(new Request("http://localhost/api/outbound", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ shopId: "shop-1", note: "[店铺:错误店名] 测试", items: [{
    productId: "sp-1", shopProductId: "sp-1", quantity: 30,
    batchAllocations: [{ purchaseOrderItemId: "batch-1", quantity: 30 }],
  }], ...overrides }),
}));
beforeEach(() => {
  remaining = 30; created = null; transactionCalls = 0; failCreate = false; legacyBatch = false;
  shopProduct = { id: "sp-1", productId: null, shopId: "shop-1" };
});

test("standalone shop product can fully consume a specified batch without a master foreign key", async () => {
  const response = await submit();
  expect(response.status).toBe(200);
  expect(remaining).toBe(0);
  expect(created.items.create[0].productId).toBeNull();
  expect(created.items.create[0].costSnapshot.totalCost).toBeCloseTo(67.8);
  expect(created.note).toBe("[店铺:南山店] 测试");
});
test("cross-shop submission is rejected before inventory changes", async () => {
  shopProduct.shopId = "shop-2";
  const response = await submit();
  expect(response.status).toBe(400);
  expect((await response.json()).error).toContain("禁止跨店");
  expect(transactionCalls).toBe(0);
  expect(remaining).toBe(30);
});
test("unknown shop product cannot fall back to a client-supplied master ID", async () => {
  const response = await submit({ items: [{ shopProductId: "missing", productId: "sp-1", quantity: 30 }] });
  expect(response.status).toBe(400);
  expect(transactionCalls).toBe(0);
});
test("legacy batch is consumable both explicitly and automatically", async () => {
  legacyBatch = true;
  expect((await submit()).status).toBe(200);
  remaining = 30;
  expect((await submit({ items: [{ shopProductId: "sp-1", quantity: 30 }] })).status).toBe(200);
  expect(remaining).toBe(0);
});
test("stale batch stock returns its actual error and does not create an order", async () => {
  remaining = 29;
  const response = await submit();
  expect(response.status).toBe(500);
  expect((await response.json()).error).toContain("批次库存不足");
  expect(remaining).toBe(29);
  expect(created).toBeNull();
});
test("order creation failure rolls back inventory within the transaction", async () => {
  failCreate = true;
  expect((await submit()).status).toBe(500);
  expect(remaining).toBe(30);
});
test("invalid outbound quantities never start a transaction", async () => {
  for (const quantity of [0, -1, 1.5]) {
    expect((await submit({ items: [{ shopProductId: "sp-1", quantity }] })).status).toBe(400);
  }
  expect(transactionCalls).toBe(0);
});
