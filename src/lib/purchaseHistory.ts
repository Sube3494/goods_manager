import type { Prisma } from "../../prisma/generated-client";

export function buildShopProductPurchaseHistoryWhere(product: {
  id: string;
  productId: string | null;
  sourceProductId: string | null;
  shop: { name: string };
}): Prisma.PurchaseOrderWhereInput {
  const templateIds = [...new Set([product.productId, product.sourceProductId].filter((id): id is string => Boolean(id)))];

  return {
    OR: [
      { items: { some: { shopProductId: product.id } } },
      // Older records only linked the template. Require the same shop and no
      // explicit shop-product link so another shop's product cannot match.
      ...(templateIds.length && product.shop.name.trim() ? [{
        shopName: product.shop.name,
        items: { some: { shopProductId: null, productId: { in: templateIds } } },
      }] : []),
    ],
  };
}
