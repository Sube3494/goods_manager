import { expect, test } from "bun:test";
import { getOutboundSalesQuantityMap } from "../src/lib/outboundSales";

const product = (id, bundleItems) => ({ id, sku: id, bundleItems });
const main = {
  id: "main-row", quantity: 3,
  shopProduct: product("main", [{ shopProductId: "oil", quantity: 2 }]),
};
const oil = { id: "oil-row", quantity: 6, shopProduct: product("oil") };

test("历史组合配件按配比排除，不依赖商品名称或分类", () => {
  const quantities = getOutboundSalesQuantityMap([main, oil]);
  expect(quantities.get(main.id)).toBe(3);
  expect(quantities.get(oil.id)).toBe(0);
});

test("同单额外单独销售的配件保留销量", () => {
  expect(getOutboundSalesQuantityMap([main, { ...oil, quantity: 8 }]).get(oil.id)).toBe(2);
  expect(getOutboundSalesQuantityMap([oil]).get(oil.id)).toBe(6);
});

test("优先采用出库时保存的销量，商品配置变化不影响统计", () => {
  const quantities = getOutboundSalesQuantityMap([
    main, { ...oil, costSnapshot: { salesQuantity: 2 } },
    { id: "extra", quantity: 2, costSnapshot: { salesQuantity: 0 } },
  ]);
  expect(quantities.get(oil.id)).toBe(2);
  expect(quantities.get("extra")).toBe(0);
});

test("支持主库配件标识和主库组合配置", () => {
  const quantities = getOutboundSalesQuantityMap([
    { id: "main", quantity: 2, product: product("main", [{ id: "oil", sourceType: "product", quantity: 1 }]) },
    { id: "oil", quantity: 2, product: product("oil") },
  ]);
  expect(quantities.get("oil")).toBe(0);
});

test("店铺商品的空配置优先于主库配置，不跨店扣除配件销量", () => {
  const quantities = getOutboundSalesQuantityMap([
    { ...main, shopProduct: { ...main.shopProduct, bundleItems: [], product: product("main", [{ id: "oil" }]) } },
    oil,
  ]);
  expect(quantities.get(oil.id)).toBe(6);
  expect(getOutboundSalesQuantityMap([
    { ...main, shopProduct: { ...main.shopProduct, shopId: "shop-a" } },
    { ...oil, shopProduct: { ...oil.shopProduct, shopId: "shop-b" } },
  ]).get(oil.id)).toBe(6);
});
