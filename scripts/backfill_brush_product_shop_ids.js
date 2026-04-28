const { PrismaClient } = require("../prisma/generated-client");

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.brushProduct.findMany({
    where: {
      shopId: null,
      isActive: true,
    },
    select: {
      id: true,
      userId: true,
      productId: true,
      brushKeyword: true,
      product: {
        select: {
          sku: true,
          name: true,
        },
      },
    },
  });

  if (rows.length === 0) {
    console.log("没有待回填店铺的刷单商品。");
    return;
  }

  let migrated = 0;
  let created = 0;
  let reused = 0;
  let missing = 0;

  for (const row of rows) {
    const matches = await prisma.shopProduct.findMany({
      where: {
        shop: row.userId ? { userId: row.userId } : undefined,
        OR: [
          { productId: row.productId },
          { sourceProductId: row.productId },
          ...(row.product?.sku
            ? [{ sku: row.product.sku }]
            : []),
        ],
      },
      select: {
        id: true,
        shopId: true,
        productId: true,
        sourceProductId: true,
        sku: true,
        shop: {
          select: {
            name: true,
          },
        },
      },
    });

    const targetEntryMap = new Map();
    for (const item of matches) {
      if (!item.shopId) continue;
      const resolvedProductId =
        typeof item.productId === "string" && item.productId.trim()
          ? item.productId.trim()
          : typeof item.sourceProductId === "string" && item.sourceProductId.trim()
          ? item.sourceProductId.trim()
          : row.productId;

      if (!targetEntryMap.has(item.shopId)) {
        targetEntryMap.set(item.shopId, {
          shopId: item.shopId,
          shopName: item.shop?.name || "",
          productId: resolvedProductId,
        });
      }
    }
    const targetEntries = Array.from(targetEntryMap.values());

    if (targetEntries.length === 0) {
      missing += 1;
      console.log(`未找到店铺: ${row.id} | ${row.product?.sku || "-"} | ${row.product?.name || "-"}`);
      continue;
    }

    await prisma.$transaction(async (tx) => {
      for (const entry of targetEntries) {
        const existing = await tx.brushProduct.findFirst({
          where: {
            userId: row.userId,
            shopId: entry.shopId,
            productId: entry.productId,
          },
          select: { id: true },
        });

        if (existing) {
          reused += 1;
          continue;
        }

        await tx.brushProduct.create({
          data: {
            userId: row.userId,
            productId: entry.productId,
            shopId: entry.shopId,
            isActive: true,
            brushKeyword: row.brushKeyword || null,
          },
        });
        created += 1;
      }

      await tx.brushProduct.delete({
        where: { id: row.id },
      });
    });

    migrated += 1;
    console.log(
      `已铺店: ${row.id} | ${row.product?.sku || "-"} | ${row.product?.name || "-"} -> ${targetEntries
        .map((entry) => entry.shopName || entry.shopId)
        .join(", ")}`
    );
  }

  console.log(`回填完成：迁移 ${migrated} 条，无匹配 ${missing} 条，新建 ${created} 条，复用已存在 ${reused} 条。`);
}

main()
  .catch((error) => {
    console.error("回填刷单商品店铺失败:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
