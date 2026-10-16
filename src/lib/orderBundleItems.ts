// 旧版订单卡片只回传展示字段：quantity 是整单总数，并且没有商品 ID。
// 入库存储的配件清单则使用每份数量。只修正这种可识别的旧展示数据。
export function normalizeOrderBundleItems(items: any[], orderQuantity: number): any[] {
  const multiplier = Math.max(1, Number(orderQuantity) || 1);
  return items.map((item) => {
    const isLegacyDisplay = !item.id && !item.shopProductId && !item.productId;
    return {
      ...item,
      quantity: isLegacyDisplay
        ? Math.max(1, Number(item.quantity || 1) / multiplier)
        : Math.max(1, Number(item.quantity || 1)),
    };
  });
}
