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

test("配对搜索按实际显示的店铺名称和店内码匹配，隐藏的主库名称不会误命中", async () => {
  const originalName = fixtures[0].name;
  const firstShop = { ...fixtures[0].shopProducts[0] };
  const secondShop = { ...fixtures[1].shopProducts[0] };
  try {
    fixtures[0].name = "玉兰旧主库名称";
    Object.assign(fixtures[0].shopProducts[0], { productName: "红茶礼盒", sku: "N100" });
    Object.assign(fixtures[1].shopProducts[0], { productName: "玉兰香薰礼盒", sku: "N564" });
    for (const search of ["玉兰", " n564 ", "yulan", "YL"]) {
      const result = await MeituanMappingService.getShopProductsWithMeituanMapping({
        userId: "user", shopId: "shop-a", search, pageSize: 1,
      });
      expect(result.items.map(item => item.id)).toEqual(["product-2"]);
      expect(result.total).toBe(1);
      expect(result.statusCounts).toEqual({ TOTAL: 1, UNBOUND: 1, BOUND: 0, HAS_SUGGESTION: 0 });
    }
    const hiddenSku = await MeituanMappingService.getShopProductsWithMeituanMapping({
      userId: "user", shopId: "shop-a", search: "B07",
    });
    expect(hiddenSku.total).toBe(0);
    const bound = await MeituanMappingService.getShopProductsWithMeituanMapping({
      userId: "user", shopId: "shop-a", search: "玉兰", status: "BOUND",
    });
    expect(bound.total).toBe(0);
  } finally {
    fixtures[0].name = originalName;
    fixtures[0].shopProducts[0] = firstShop;
    fixtures[1].shopProducts[0] = secondShop;
  }
});

test("搜索支持当前平台 ID、空搜索和没有独立名称时的主库回退", async () => {
  const query = (search, platform = "meituan") => MeituanMappingService.getShopProductsWithMeituanMapping({
    userId: "user", shopId: "shop-a", search, platform,
  });
  expect((await query("玩具")).items.map(item => item.id)).toEqual(["product-1"]);
  expect((await query("200", "jd")).total).toBe(1);
  expect((await query("200", "meituan")).total).toBe(0);
  expect((await query("   ")).total).toBe(2);
  expect((await query("不存在的商品")).total).toBe(0);
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
