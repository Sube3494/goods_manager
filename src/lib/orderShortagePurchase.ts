import { PurchaseOrder, PurchaseStatus } from "@/lib/types";
import { isShopNameMatch } from "@/lib/shopIdentity";

export type OrderShortageItem = {
  productId?: string;
  shopProductId?: string;
  name?: string;
  image?: string | null;
  missingQuantity: number;
  uncoveredMissingQuantity?: number;
  mappedShopId?: string;
  mappedShopName?: string;
};

export type OrderPurchaseDraft = PurchaseOrder & {
  sourceOrderId?: string;
  isExistingPurchase?: boolean;
  newPurchaseDraft?: PurchaseOrder & { sourceOrderId?: string };
};

export function createOrderShortagePurchaseDraft(
  items: OrderShortageItem[],
  sourceOrderId: string,
  localShops: Array<{ id: string; name: string; address?: string | null }>,
  quantityMode: "missing" | "uncovered" = "uncovered",
): PurchaseOrder & { sourceOrderId: string } {
  const today = new Date();
  const draftShopId = items[0]?.mappedShopId || "";
  const draftShopName = items[0]?.mappedShopName || "";
  const matchedShop = draftShopId
    ? localShops.find((shop) => shop.id === draftShopId)
    : draftShopName
      ? localShops.find((shop) => isShopNameMatch(shop.name, draftShopName))
      : undefined;

  return {
    id: `PO-${today.toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`,
    status: "Confirmed" as PurchaseStatus,
    type: "Purchase",
    date: today.toLocaleString("sv-SE").slice(0, 16).replace("T", " "),
    items: items.map((item) => ({
      productId: item.productId || null,
      shopProductId: item.shopProductId || undefined,
      product: {
        id: item.shopProductId || item.productId || "",
        name: item.name || "未命名商品",
        sku: "",
        categoryId: "",
        stock: 0,
        image: item.image || undefined,
        costPrice: 0,
      },
      image: item.image || undefined,
      supplierId: undefined,
      quantity: Math.max(1, Number(quantityMode === "missing" ? item.missingQuantity : item.uncoveredMissingQuantity ?? item.missingQuantity)),
      costPrice: 0,
    })),
    shippingFees: 0,
    extraFees: 0,
    totalAmount: 0,
    discountAmount: 0,
    shippingAddress: matchedShop?.address || "",
    shopName: draftShopName,
    sourceOrderId,
  };
}
