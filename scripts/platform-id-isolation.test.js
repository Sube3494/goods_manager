import { test, expect, mock } from "bun:test";

const writes = [];
const fixtures = [
  {
    id: "product-1", name: "玩具", sku: "B07", image: null, specs: {},
    shopProducts: [
      { id: "local", shopId: "shop-a", meituanSkuId: "100,101", jdSkuId: "200", doudianSkuId: "300" },
      { id: "foreign", shopId: "shop-b", meituanSkuId: "999" },
    ],
    meituanSkuMappings: [{ id: "old", meituanSkuId: "999", createdAt: new Date() }],
  },
  {
    id: "product-2", name: "礼盒", sku: "B08", image: null, specs: {},
    shopProducts: [{ id: "empty", shopId: "shop-a", meituanSkuId: null, jdSkuId: null }],
    meituanSkuMappings: [{ id: "legacy", meituanSkuId: "888", createdAt: new Date() }],
  },
];
mock.module("../src/lib/prisma", () => ({ default: {
  product: { findMany: async () => fixtures },
  meituanImportItem: { findMany: async () => [] },
} }));
mock.module("../src/lib/storage", () => ({ getStorageStrategy: async () => ({ resolveUrl: (url) => url }) }));

const { MeituanMappingService } = await import("../src/services/meituanMappingService");
const { replaceProductMeituanSkuMappings } = await import("../src/lib/productMeituanSku");

test("店铺工作台仅使用当前店铺 ID，空字段不回退到主商品历史映射", async () => {
  const result = await MeituanMappingService.getShopProductsWithMeituanMapping({ userId: "user", shopId: "shop-a" });
  expect(result.items[0].meituanSkuMappings.map((mapping) => mapping.meituanSkuId)).toEqual(["100", "101"]);
  expect(result.items[1].meituanSkuMappings).toEqual([]);
  expect(result.statusCounts).toEqual({ TOTAL: 2, UNBOUND: 1, BOUND: 1, HAS_SUGGESTION: 0 });
});

test("平台统计在分页前计算，抖店字段独立于美团", async () => {
  const result = await MeituanMappingService.getShopProductsWithMeituanMapping({ userId: "user", shopId: "shop-a", platform: "doudian", status: "BOUND", pageSize: 1 });
  expect(result.items[0].doudianSkuId).toBe("300");
  expect(result.total).toBe(1);
  expect(result.statusCounts.TOTAL).toBe(2);
  expect(result.statusCounts.BOUND).toBe(1);
});

test("替换或清空美团映射仅更新美团导入池，其他平台同号 ID 不受影响", async () => {
  const tx = {
    productMeituanSku: { deleteMany: async () => {}, createMany: async () => {} },
    meituanImportItem: { updateMany: async (query) => { writes.push(query); } },
  };
  await replaceProductMeituanSkuMappings(tx, "product-1", "user", ["100"]);
  await replaceProductMeituanSkuMappings(tx, "product-1", "user", []);
  expect(writes.length).toBe(3);
  for (const query of writes) expect(query.where.platform).toBe("meituan");
});
