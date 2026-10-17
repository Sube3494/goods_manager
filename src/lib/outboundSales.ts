type BundleProduct = {
  id: string;
  sku?: string | null;
  bundleItems?: unknown;
};

type SalesItem = {
  id: string;
  quantity: number;
  costSnapshot?: unknown;
  product?: BundleProduct | null;
  shopProduct?: (BundleProduct & { product?: BundleProduct | null; shopId?: string | null }) | null;
};

// New outbounds save their actual sales quantity. For older records, subtract
// the components of bundles present in the same outbound, rather than hiding
// a product everywhere just because it is also used as an accessory.
export function getOutboundSalesQuantityMap(items: SalesItem[]): Map<string, number> {
  const accessoryQuantities = new Map<string, number>();
  for (const parent of items) {
    const bundle = parent.shopProduct?.bundleItems
      || parent.shopProduct?.product?.bundleItems || parent.product?.bundleItems;
    if (!Array.isArray(bundle)) continue;
    for (const raw of bundle) {
      if (!raw || typeof raw !== "object") continue;
      const component = raw as Record<string, unknown>;
      const candidates = items.filter((item) => item.id !== parent.id && (
        !parent.shopProduct?.shopId || !item.shopProduct?.shopId
        || parent.shopProduct.shopId === item.shopProduct.shopId
      ));
      const shopId = component.shopProductId || (component.sourceType !== "product" ? component.id : null);
      const productId = component.productId || (component.sourceType === "product" ? component.id : null);
      let matches = shopId ? candidates.filter((item) => item.shopProduct?.id === shopId) : [];
      if (!matches.length && productId) matches = candidates.filter((item) => item.product?.id === productId);
      if (!matches.length && component.id) matches = candidates.filter((item) => item.product?.id === component.id);
      if (!matches.length && component.sku) matches = candidates.filter((item) =>
        (item.shopProduct?.sku || item.product?.sku) === component.sku);
      if (matches.length !== 1) continue;
      const match = matches[0];
      const quantity = Math.max(1, Math.trunc(Number(component.quantity) || 1)) * parent.quantity;
      accessoryQuantities.set(match.id, (accessoryQuantities.get(match.id) || 0) + quantity);
    }
  }
  return new Map(items.map((item) => {
    const snapshot = item.costSnapshot && typeof item.costSnapshot === "object"
      ? item.costSnapshot as Record<string, unknown> : null;
    const saved = snapshot?.salesQuantity;
    const quantity = typeof saved === "number" && Number.isFinite(saved)
      ? saved : item.quantity - (accessoryQuantities.get(item.id) || 0);
    return [item.id, Math.max(0, Math.min(item.quantity, quantity))];
  }));
}
