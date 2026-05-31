import type { Prisma } from "../../prisma/generated-client";

type PurchaseOrderItemWithSupplier = {
  supplierId?: string | null;
};

export function normalizeSupplierId(supplierId: string | null | undefined) {
  const normalized = typeof supplierId === "string" ? supplierId.trim() : "";
  return normalized || null;
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
