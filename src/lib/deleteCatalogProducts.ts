import type { Prisma } from "../../prisma/generated-client";

type CatalogTransaction = Pick<Prisma.TransactionClient, "product" | "shopProduct" | "brushProduct">;

export class CatalogDeletionScopeError extends Error {
  constructor() {
    super("待删除商品不属于当前商品库，请刷新页面后重试。未删除任何商品。");
    this.name = "CatalogDeletionScopeError";
  }
}

/** Run in a transaction. Keep referenced rows intact for historical accounting. */
export async function deleteCatalogProducts(
  tx: CatalogTransaction,
  requestedIds: string[],
  actor: { id: string; role?: string },
  libraryId: string,
) {
  if (!libraryId.trim()) throw new CatalogDeletionScopeError();
  const uniqueRequestedIds = [...new Set(requestedIds)];
  const isSuperAdmin = actor.role === "SUPER_ADMIN";
  const roots = await tx.product.findMany({
    where: {
      id: { in: uniqueRequestedIds },
      deletedAt: null,
      ...(isSuperAdmin ? {} : { userId: actor.id }),
    },
    select: { id: true, libraryId: true },
  });
  if (roots.some((product) => product.libraryId !== libraryId)
    || (roots.length > 0 && roots.length !== uniqueRequestedIds.length)) {
    throw new CatalogDeletionScopeError();
  }
  const productIds = new Set(roots.map((product) => product.id));
  let frontier = [...productIds];
  // Copies can themselves be copied. Walk descendants without deleting sources
  // or other members' goods when the caller is not a super administrator.
  while (frontier.length) {
    const copies = await tx.product.findMany({
      where: {
        sourceProductId: { in: frontier },
        OR: [{ libraryId: null }, { libraryId }],
        ...(isSuperAdmin ? {} : { userId: actor.id }),
      },
      select: { id: true },
    });
    frontier = copies.map((copy) => copy.id).filter((id) => !productIds.has(id));
    frontier.forEach((id) => productIds.add(id));
  }
  if (!productIds.size) {
    return { count: 0, copiedCount: 0, shopProductCount: 0, deletedIds: [] as string[] };
  }
  const ids = [...productIds];
  const shopProducts = await tx.shopProduct.findMany({
    where: {
      deletedAt: null,
      OR: [{ productId: { in: ids } }, { sourceProductId: { in: ids } }],
      AND: [{ OR: [{ productId: null }, { productId: { in: ids } }] }],
      ...(isSuperAdmin ? {} : { shop: { userId: actor.id } }),
    },
    select: { id: true },
  });
  const shopIds = shopProducts.map((product) => product.id);
  const deletedAt = new Date();
  await tx.shopProduct.updateMany({
    where: { id: { in: shopIds } },
    data: { deletedAt, isPublic: false },
  });
  await tx.brushProduct.updateMany({
    where: {
      OR: [{ productId: { in: ids } }, { shopProductId: { in: shopIds } }],
      ...(isSuperAdmin ? {} : { userId: actor.id }),
    },
    data: { isActive: false },
  });
  await tx.product.updateMany({
    where: { id: { in: ids } },
    data: { deletedAt, isPublic: false },
  });
  return {
    count: roots.length,
    copiedCount: productIds.size - roots.length,
    shopProductCount: shopIds.length,
    deletedIds: roots.map((product) => product.id),
  };
}
