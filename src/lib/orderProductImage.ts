import type { AutoPickOrder } from "./types";

// Patch every loaded occurrence without replacing pages or changing list order.
export function updateOrderProductImage(orders: AutoPickOrder[], shopProductId: string, image: string): AutoPickOrder[] {
  return orders.map((order) => {
    let changed = false;
    const items = order.items.map((item) => {
      const product = item.matchedProduct;
      if (!product || (product.shopProductId || (product.sourceType === "shopProduct" ? product.id : "")) !== shopProductId) {
        return item;
      }
      changed = true;
      return { ...item, matchedProduct: { ...product, image } };
    });
    return changed ? { ...order, items } : order;
  });
}
