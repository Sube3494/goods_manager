export {};

const { PrismaClient } = require("../prisma/generated-client");
const prisma = new PrismaClient();

const RETURN_NOTE_PREFIX = "单据由出库退回自动产生。关联出库单:";

type ScopeKey = {
  productId: string | null;
  productVariantId: string | null;
  shopProductId: string | null;
  shopProductVariantId: string | null;
};

function makeScopeKey(scope: ScopeKey) {
  return [
    scope.productId ?? "",
    scope.productVariantId ?? "",
    scope.shopProductId ?? "",
    scope.shopProductVariantId ?? "",
  ].join("::");
}

async function syncProductStock(productId: string) {
  const aggregateResult = await prisma.purchaseOrderItem.aggregate({
    where: {
      productId,
      remainingQuantity: { gt: 0 },
      purchaseOrder: { status: "Received" },
    },
    _sum: {
      remainingQuantity: true,
    },
  });

  await prisma.product.update({
    where: { id: productId },
    data: { stock: aggregateResult._sum.remainingQuantity || 0 },
  });
}

async function syncProductVariantStock(productVariantId: string) {
  const aggregateResult = await prisma.purchaseOrderItem.aggregate({
    where: {
      productVariantId,
      remainingQuantity: { gt: 0 },
      purchaseOrder: { status: "Received" },
    },
    _sum: {
      remainingQuantity: true,
    },
  });

  await prisma.productVariant.update({
    where: { id: productVariantId },
    data: { stock: aggregateResult._sum.remainingQuantity || 0 },
  });

  const variant = await prisma.productVariant.findUnique({
    where: { id: productVariantId },
    select: { productId: true },
  });

  if (variant?.productId) {
    await syncProductStock(variant.productId);
  }
}

async function syncShopProductStock(shopProductId: string) {
  const aggregateResult = await prisma.purchaseOrderItem.aggregate({
    where: {
      shopProductId,
      remainingQuantity: { gt: 0 },
      purchaseOrder: { status: "Received" },
    },
    _sum: {
      remainingQuantity: true,
    },
  });

  await prisma.shopProduct.update({
    where: { id: shopProductId },
    data: { stock: aggregateResult._sum.remainingQuantity || 0 },
  });

  const shopProduct = await prisma.shopProduct.findUnique({
    where: { id: shopProductId },
    select: { productId: true },
  });

  if (shopProduct?.productId) {
    await syncProductStock(shopProduct.productId);
  }
}

async function syncShopProductVariantStock(shopProductVariantId: string) {
  const aggregateResult = await prisma.purchaseOrderItem.aggregate({
    where: {
      shopProductVariantId,
      remainingQuantity: { gt: 0 },
      purchaseOrder: { status: "Received" },
    },
    _sum: {
      remainingQuantity: true,
    },
  });

  await prisma.shopProductVariant.update({
    where: { id: shopProductVariantId },
    data: { stock: aggregateResult._sum.remainingQuantity || 0 },
  });

  const shopVariant = await prisma.shopProductVariant.findUnique({
    where: { id: shopProductVariantId },
    select: {
      shopProductId: true,
      productVariantId: true,
    },
  });

  if (shopVariant?.shopProductId) {
    await syncShopProductStock(shopVariant.shopProductId);
  }

  if (shopVariant?.productVariantId) {
    await syncProductVariantStock(shopVariant.productVariantId);
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const orders = await prisma.purchaseOrder.findMany({
    where: {
      status: "Received",
      note: {
        startsWith: RETURN_NOTE_PREFIX,
      },
    },
    include: {
      items: {
        select: {
          id: true,
          quantity: true,
          remainingQuantity: true,
          productId: true,
          productVariantId: true,
          shopProductId: true,
          shopProductVariantId: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const targetItems = orders.flatMap((order: any) => order.items);
  const dirtyItems = targetItems.filter((item: any) => Number(item.remainingQuantity ?? 0) !== 0);
  const dirtyItemIds = dirtyItems.map((item: any) => item.id);

  const affectedScopes = new Map<string, ScopeKey>();
  for (const item of targetItems) {
    const scope = {
      productId: item.productId,
      productVariantId: item.productVariantId,
      shopProductId: item.shopProductId,
      shopProductVariantId: item.shopProductVariantId,
    };
    affectedScopes.set(makeScopeKey(scope), scope);
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        matchedOrders: orders.length,
        matchedItems: targetItems.length,
        dirtyItems: dirtyItems.length,
        affectedScopes: affectedScopes.size,
      },
      null,
      2
    )
  );

  if (dryRun || dirtyItems.length === 0) {
    return;
  }

  await prisma.$transaction(async (tx: any) => {
    await tx.purchaseOrderItem.updateMany({
      where: { id: { in: dirtyItemIds } },
      data: { remainingQuantity: 0 },
    });

    await tx.productBatch.updateMany({
      where: {
        purchaseOrderItemId: { in: dirtyItemIds },
      },
      data: {
        remainingStock: 0,
      },
    });
  });

  for (const scope of affectedScopes.values()) {
    if (scope.shopProductVariantId) {
      await syncShopProductVariantStock(scope.shopProductVariantId);
      continue;
    }

    if (scope.productVariantId) {
      await syncProductVariantStock(scope.productVariantId);
      continue;
    }

    if (scope.shopProductId) {
      await syncShopProductStock(scope.shopProductId);
      continue;
    }

    if (scope.productId) {
      await syncProductStock(scope.productId);
    }
  }

  console.log(`cleanup finished: ${dirtyItems.length} items reset`);
}

main()
  .catch((error) => {
    console.error("cleanup failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
