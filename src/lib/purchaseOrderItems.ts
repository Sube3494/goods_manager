import type { Prisma } from "../../prisma/generated-client";

type PurchaseOrderItemWithSupplier = {
  supplierId?: string | null;
};

type PurchaseOrderItemWithRelations = PurchaseOrderItemWithSupplier & {
  productId?: string | null;
  shopProductId?: string | null;
};

export function normalizeSupplierId(supplierId: string | null | undefined) {
  const normalized = typeof supplierId === "string" ? supplierId.trim() : "";
  return normalized || null;
}

function normalizeEntityId(value: string | null | undefined) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

export async function sanitizePurchaseOrderItems<T extends PurchaseOrderItemWithRelations>(
  tx: Prisma.TransactionClient,
  items: T[],
): Promise<Array<T & { supplierId: string | null; productId: string | null; shopProductId: string | null }>> {
  const normalizedSupplierIds = [
    ...new Set(
      items
        .map((item) => normalizeSupplierId(item.supplierId))
        .filter((supplierId): supplierId is string => Boolean(supplierId)),
      ),
  ];

  const normalizedShopProductIds = [
    ...new Set(
      items
        .map((item) => normalizeEntityId(item.shopProductId))
        .filter((shopProductId): shopProductId is string => Boolean(shopProductId)),
    ),
  ];

  const normalizedProductIds = [
    ...new Set(
      items
        .map((item) => normalizeEntityId(item.productId))
        .filter((productId): productId is string => Boolean(productId)),
    ),
  ];

  const [suppliers, shopProducts, products] = await Promise.all([
    normalizedSupplierIds.length > 0
      ? tx.supplier.findMany({
          where: {
            id: { in: normalizedSupplierIds },
          },
          select: {
            id: true,
          },
        })
      : Promise.resolve([]),
    normalizedShopProductIds.length > 0
      ? tx.shopProduct.findMany({
          where: {
            id: { in: normalizedShopProductIds },
          },
          select: {
            id: true,
            productId: true,
          },
        })
      : Promise.resolve([]),
    normalizedProductIds.length > 0
      ? tx.product.findMany({
          where: {
            id: { in: normalizedProductIds },
          },
          select: {
            id: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const validSupplierIds = new Set(suppliers.map((supplier) => supplier.id));
  const shopProductMap = new Map(shopProducts.map((shopProduct) => [shopProduct.id, shopProduct]));
  const validProductIds = new Set(products.map((product) => product.id));

  return items.map((item) => {
    const supplierId = normalizeSupplierId(item.supplierId);
    const shopProductId = normalizeEntityId(item.shopProductId);
    const requestedProductId = normalizeEntityId(item.productId);
    const linkedShopProduct = shopProductId ? shopProductMap.get(shopProductId) : null;

    if (shopProductId && !linkedShopProduct) {
      throw new Error(`采购商品不存在：shopProductId=${shopProductId}`);
    }

    const productId = linkedShopProduct
      ? normalizeEntityId(linkedShopProduct.productId)
      : requestedProductId && validProductIds.has(requestedProductId)
      ? requestedProductId
      : null;

    if (!shopProductId && requestedProductId && !productId) {
      throw new Error(`采购主商品不存在：productId=${requestedProductId}`);
    }

    return {
      ...item,
      supplierId: supplierId && validSupplierIds.has(supplierId) ? supplierId : null,
      productId,
      shopProductId,
    };
  });
}

export async function sanitizePurchaseOrderItemSuppliers<T extends PurchaseOrderItemWithSupplier>(
  tx: Prisma.TransactionClient,
  items: T[],
): Promise<Array<T & { supplierId: string | null }>> {
  const normalizedSupplierIds = [
    ...new Set(
      items
        .map((item) => normalizeSupplierId(item.supplierId))
        .filter((supplierId): supplierId is string => Boolean(supplierId)),
    ),
  ];

  if (items.length === 0) {
    return [];
  }

  if (normalizedSupplierIds.length === 0) {
    return items.map((item) => ({
      ...item,
      supplierId: null,
    }));
  }

  const suppliers = await tx.supplier.findMany({
    where: {
      id: { in: normalizedSupplierIds },
    },
    select: {
      id: true,
    },
  });

  const validSupplierIds = new Set(suppliers.map((supplier) => supplier.id));

  return items.map((item) => {
    const supplierId = normalizeSupplierId(item.supplierId);

    return {
      ...item,
      supplierId: supplierId && validSupplierIds.has(supplierId) ? supplierId : null,
    };
  });
}
