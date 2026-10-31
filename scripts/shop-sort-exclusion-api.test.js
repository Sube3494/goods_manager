import { beforeEach, expect, mock, test } from "bun:test";

let saved;
mock.module("../src/lib/auth", () => ({ getAuthorizedUser: async () => ({ id: "user-1" }) }));
mock.module("../src/lib/catalogPrisma", () => ({ default: {
  shop: { findFirst: async () => ({ id: "shop-1" }) },
  shopProduct: {
    findMany: async () => [{ id: "item-1", sku: "1001" }],
    findFirst: async () => null,
    updateMany: async () => ({}),
    update: async ({ data }) => { saved = { ...saved, ...data }; return saved; },
  },
} }));
const { PUT } = await import("../src/app/api/shops/[id]/products/batch/route");

beforeEach(() => {
  saved = { id: "item-1", sku: "1001", sortNumber: 1, sortGroupName: "玩具", sortCategoryName: "玩具", costPrice: 50 };
});

async function update(fields) {
  return PUT(new Request("http://localhost/api/shops/shop-1/products/batch", {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ updates: [{ id: "item-1", ...fields }] }),
  }), { params: Promise.resolve({ id: "shop-1" }) });
}

test("保存排除状态会持久清空店内码和临时分类，并保留商品成本", async () => {
  expect((await update({ sortNumber: 0 })).status).toBe(200);
  expect(saved).toMatchObject({ sku: null, sortNumber: 0, sortGroupName: null, sortCategoryName: null, costPrice: 50 });
});

test("恢复排序后可重新保存编码、分类和顺序", async () => {
  await update({ sortNumber: 0 });
  expect((await update({ sortNumber: 1, sku: "2001", sortGroupName: "食品", sortCategoryName: "食品" })).status).toBe(200);
  expect(saved).toMatchObject({ sku: "2001", sortNumber: 1, sortGroupName: "食品", costPrice: 50 });
});
