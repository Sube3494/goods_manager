import { expect, test } from "bun:test";
import { buildRecentInboundOrderWhere, resolveRecentInboundProduct } from "../src/lib/recentInbound";

const resolveUrl = (path) => `https://images.example/${path}`;
const shopProduct = { id: "shop-product", productName: "店铺玩具", sku: "B07（自编）", productImage: "shop.png" };
const templateProduct = { id: "template", name: "模板玩具", sku: "TEMPLATE-07", image: "template.png" };

test("店铺独立商品没有主商品关联时仍能展示名称、编号和图片", () => {
  expect(resolveRecentInboundProduct(null, shopProduct, resolveUrl)).toEqual({
    id: "shop-product", name: "店铺玩具", sku: "B07", image: "https://images.example/shop.png",
  });
});

test("关联模板的入库记录优先使用店铺信息，不显示模板编号", () => {
  expect(resolveRecentInboundProduct(templateProduct, shopProduct, resolveUrl).image).toBe("https://images.example/shop.png");
  expect(resolveRecentInboundProduct(templateProduct, { ...shopProduct, sku: null, productImage: null }, resolveUrl)).toEqual({
    id: "shop-product", name: "店铺玩具", sku: null, image: "https://images.example/template.png",
  });
});

test("无备注的已入库单不会被自动入库排除条件过滤", () => {
  const where = buildRecentInboundOrderWhere("owner");
  expect(where.userId).toBe("owner");
  expect(where.status).toBe("Received");
  for (const condition of where.AND) {
    expect(condition.OR).toContainEqual({ note: null });
  }
  expect(where.NOT).toHaveLength(2);
});
