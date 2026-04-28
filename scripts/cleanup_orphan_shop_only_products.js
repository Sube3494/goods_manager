const { PrismaClient } = require("../prisma/generated-client");

const prisma = new PrismaClient();

const SOURCE_CATEGORY_NAME = "推单商品";
const ARCHIVE_CATEGORY_NAME = "历史残留";
const ARCHIVE_CATEGORY_DESCRIPTION = "系统历史残留商品归档";

function countReferences(row) {
  return Object.values(row._count || {}).reduce((sum, value) => sum + Number(value || 0), 0);
}

async function cleanupForCategory(category) {
  const rows = await prisma.product.findMany({
    where: {
      userId: category.userId,
      categoryId: category.id,
      isShopOnly: true,
      shopProducts: { none: {} },
    },
    select: {
      id: true,
      _count: {
        select: {
          brushOrderItems: true,
          brushOrderPlanItems: true,
          outboundItems: true,
          orderItems: true,
          brushProducts: true,
          storeOpeningItems: true,
          gallery: true,
        },
      },
    },
  });

  if (rows.length === 0) {
    return { scanned: 0, deleted: 0, moved: 0 };
  }

  const deletableIds = [];
  const archivedIds = [];

  for (const row of rows) {
    if (countReferences(row) > 0) {
      archivedIds.push(row.id);
    } else {
      deletableIds.push(row.id);
    }
  }

  let archiveCategoryId = null;
  if (archivedIds.length > 0) {
    const archiveCategory = await prisma.category.upsert({
      where: {
        name_userId: {
          name: ARCHIVE_CATEGORY_NAME,
          userId: category.userId,
        },
      },
      update: {
        description: ARCHIVE_CATEGORY_DESCRIPTION,
      },
      create: {
        name: ARCHIVE_CATEGORY_NAME,
        description: ARCHIVE_CATEGORY_DESCRIPTION,
        userId: category.userId,
      },
      select: {
        id: true,
      },
    });
    archiveCategoryId = archiveCategory.id;
  }

  const result = await prisma.$transaction(async (tx) => {
    const deleted = deletableIds.length > 0
      ? await tx.product.deleteMany({
          where: {
            id: { in: deletableIds },
          },
        })
      : { count: 0 };

    const moved = archiveCategoryId && archivedIds.length > 0
      ? await tx.product.updateMany({
          where: {
            id: { in: archivedIds },
          },
          data: {
            categoryId: archiveCategoryId,
            isDiscontinued: true,
          },
        })
      : { count: 0 };

    return {
      deleted: deleted.count,
      moved: moved.count,
    };
  });

  return {
    scanned: rows.length,
    deleted: result.deleted,
    moved: result.moved,
  };
}

async function cleanupEmptyArchiveCategories() {
  const archiveCategories = await prisma.category.findMany({
    where: {
      OR: [
        { name: ARCHIVE_CATEGORY_NAME },
        { description: ARCHIVE_CATEGORY_DESCRIPTION },
      ],
    },
    select: {
      id: true,
      userId: true,
    },
  });

  let deletedCount = 0;
  for (const category of archiveCategories) {
    const productCount = await prisma.product.count({
      where: {
        userId: category.userId || undefined,
        categoryId: category.id,
      },
    });
    const shopProductCount = await prisma.shopProduct.count({
      where: {
        categoryId: category.id,
        ...(category.userId ? {
          shop: {
            userId: category.userId,
          },
        } : {}),
      },
    });

    if (productCount === 0 && shopProductCount === 0) {
      await prisma.category.delete({
        where: { id: category.id },
      });
      deletedCount += 1;
    }
  }

  return deletedCount;
}

async function main() {
  const categories = await prisma.category.findMany({
    where: {
      name: SOURCE_CATEGORY_NAME,
    },
    select: {
      id: true,
      userId: true,
      name: true,
    },
  });

  let totalScanned = 0;
  let totalDeleted = 0;
  let totalMoved = 0;

  for (const category of categories) {
    const result = await cleanupForCategory(category);
    totalScanned += result.scanned;
    totalDeleted += result.deleted;
    totalMoved += result.moved;
  }

  const deletedArchiveCategories = await cleanupEmptyArchiveCategories();

  console.log(
    `孤儿单店商品清理完成：扫描 ${totalScanned} 条，删除 ${totalDeleted} 条，归档 ${totalMoved} 条，移除空历史残留分类 ${deletedArchiveCategories} 个。`
  );
}

main()
  .catch((error) => {
    console.error("清理孤儿单店商品失败:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
