import type { Prisma } from "../../prisma/generated-client";
import { AUTO_INBOUND_NOTE_KEYWORD, AUTO_INBOUND_TYPE, ORDER_SHORTAGE_PURCHASE_NOTE_KEYWORD } from "./purchaseOrderTypes";

export function buildRecentInboundOrderWhere(userId: string): Prisma.PurchaseOrderWhereInput {
  return {
    userId,
    status: "Received",
    NOT: [{ type: AUTO_INBOUND_TYPE }, { id: { startsWith: "PO-AUTO-" } }],
    AND: [AUTO_INBOUND_NOTE_KEYWORD, ORDER_SHORTAGE_PURCHASE_NOTE_KEYWORD].map((keyword) => ({
      OR: [
        { note: null },
        { NOT: { note: { contains: keyword, mode: "insensitive" } } },
      ],
    })),
  };
}

type InboundProduct = { id: string; name: string; sku: string | null; image: string | null };
type InboundShopProduct = { id: string; productName: string | null; sku: string | null; productImage: string | null };

export function resolveRecentInboundProduct(
  product: InboundProduct | null,
  shopProduct: InboundShopProduct | null | undefined,
  resolveUrl: (image: string) => string,
) {
  if (!shopProduct && !product) return null;
  const rawImage = shopProduct?.productImage || product?.image;
  return {
    id: shopProduct?.id || product!.id,
    name: shopProduct?.productName || product?.name || "未命名商品",
    sku: String(shopProduct?.sku || "").replace(/\(自编\)|（自编）/gi, "").trim() || null,
    image: rawImage ? resolveUrl(rawImage) : null,
  };
}
