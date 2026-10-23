import { expect, test } from "bun:test";
import { buildShopProductPurchaseHistoryWhere } from "../src/lib/purchaseHistory";

const target = {
  id: "nanshan-product", productId: "shared-template", sourceProductId: "source-template",
  shop: { name: "南山店" },
};

// Evaluate the query against realistic records, including shared-template links.
function matches(value, where) {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR") return condition.some((branch) => matches(value, branch));
    if (key === "items") return value.items.some((item) => matches(item, condition.some));
    if (condition && typeof condition === "object") return condition.in.includes(value[key]);
    return value[key] === condition;
  });
}

test("共享模板的门店商品只关联自身入库，不串到其他店铺", () => {
  const where = buildShopProductPurchaseHistoryWhere(target);
  const order = (shopName, shopProductId, productId = "shared-template") => ({
    shopName, items: [{ shopProductId, productId }],
  });
  expect(matches(order("南山店", target.id), where)).toBe(true);
  expect(matches(order("其他店", "other-product"), where)).toBe(false);
  expect(matches(order("南山店", "other-product"), where)).toBe(false);
  expect(matches(order("南山店", null), where)).toBe(true);
  expect(matches(order("南山店", null, "source-template"), where)).toBe(true);
  expect(matches(order("其他店", null), where)).toBe(false);
  expect(matches(order("", null), where)).toBe(false);
  expect(matches(order("南山店", null, "unrelated"), where)).toBe(false);
});

test("独立商品及无门店名称的商品不会扩大到模板入库", () => {
  for (const product of [
    { ...target, productId: null, sourceProductId: null },
    { ...target, shop: { name: "" } },
  ]) {
    expect(buildShopProductPurchaseHistoryWhere(product)).toEqual({
      OR: [{ items: { some: { shopProductId: target.id } } }],
    });
  }
});
