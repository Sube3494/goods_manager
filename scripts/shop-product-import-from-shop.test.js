import { beforeEach, expect, mock, test } from "bun:test";

let user;
let ownedShops;
let source;
let target;

mock.module("../src/lib/auth", () => ({ getAuthorizedUser: async () => user }));
mock.module("../src/services/productService", () => ({
  ProductService: { generatePinyinSearchText: () => "pinyin" },
}));
mock.module("../src/lib/prisma", () => ({ default: {
  shop: { count: async ({ where }) => where.id.in.filter((id) => ownedShops.get(id) === where.userId).length },
  $transaction: (run) => run({
    $queryRaw: async () => [],
    shopProduct: {
      findMany: async ({ where }) => where.shopId === "source" ? source : target,
      createMany: async ({ data }) => {
        target.push(...data);
        return { count: data.length };
      },
    },
  }),
} }));

const { POST } = await import("../src/app/api/shops/[id]/products/import-from-shop/route");
const context = { params: Promise.resolve({ id: "target" }) };
const importProducts = (options) => POST(new Request("http://localhost", {
  method: "POST",
  body: JSON.stringify({ sourceShopId: "source", ...options }),
}), context);

beforeEach(() => {
  user = { id: "owner", role: "USER" };
  ownedShops = new Map([["source", "owner"], ["target", "owner"]]);
  source = [
    {
      id: "bundle", sku: "B01", productId: "catalog", stock: 10,
      jdSkuId: "jd", meituanSkuId: "mt", taobaoSkuId: "tb", doudianSkuId: "dd",
      isBundle: true, bundleItems: [{ id: "part", shopProductId: "part", productId: "part", quantity: 2 }],
      costPrice: 12, remark: "备注", shelfLifeDays: 90, isShelfLife: true, sortNumber: 2,
      product: { name: "套装", image: "cover.jpg", categoryId: "category", category: { name: "套装" }, specs: { size: "L" } },
    },
    { id: "part", productName: "配件", sku: null, productId: null, sourceProductId: null },
  ];
  target = [];
});

test("保留商品资料和配件关系，平台 ID、共享商品关联和库存使用默认值", async () => {
  expect(await (await importProducts({ all: true })).json()).toEqual({ imported: 2, skipped: 0 });
  const [bundle, part] = target;
  expect(bundle).toMatchObject({
    shopId: "target", sku: "B01", productName: "套装",
    productImage: "cover.jpg", categoryId: "category", categoryName: "套装", specs: { size: "L" },
    costPrice: 12, remark: "备注", shelfLifeDays: 90, isShelfLife: true, sortNumber: 2,
    bundleItems: [{ id: part.id, shopProductId: part.id, productId: null, quantity: 2 }],
  });
  for (const field of ["jdSkuId", "meituanSkuId", "taobaoSkuId", "doudianSkuId", "productId", "sourceProductId", "stock"]) {
    expect(bundle).not.toHaveProperty(field);
  }
  expect(await (await importProducts({ all: true })).json()).toEqual({ imported: 0, skipped: 2 });
});

test("组合商品只能引用目标店已有或本次同时导入的配件", async () => {
  expect((await importProducts({ productIds: ["bundle"] })).status).toBe(409);
  expect(target).toHaveLength(0);

  await importProducts({ productIds: ["part"] });
  const [part] = target;
  expect(await (await importProducts({ productIds: ["bundle"] })).json()).toEqual({ imported: 1, skipped: 0 });
  expect(target[1].bundleItems).toEqual([{ id: part.id, shopProductId: part.id, productId: null, quantity: 2 }]);
});

test("仅导入所选商品，保留同店内码商品及其平台配对", async () => {
  target = [{ id: "existing", sku: "B01", meituanSkuId: "existing-mt" }];
  expect(await (await importProducts({ productIds: ["bundle"] })).json()).toEqual({ imported: 0, skipped: 1 });
  expect(target).toEqual([{ id: "existing", sku: "B01", meituanSkuId: "existing-mt" }]);
  expect(await (await importProducts({ productIds: ["part"] })).json()).toEqual({ imported: 1, skipped: 0 });
});

test("拒绝其他店铺的商品 ID、同店导入和跨账户导入", async () => {
  expect((await importProducts({ productIds: ["part", "unavailable"] })).status).toBe(409);
  expect((await importProducts({ sourceShopId: "target", all: true })).status).toBe(400);
  ownedShops.set("source", "someone-else");
  expect((await importProducts({ all: true })).status).toBe(404);
  user = null;
  expect((await importProducts({ all: true })).status).toBe(401);
  expect(target).toHaveLength(0);
});
