const { PrismaClient } = require("../prisma/generated-client");

const prisma = new PrismaClient();

function normalizeExternalId(value) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function scoreShop(shop) {
  let score = 0;
  if (shop.latitude != null && shop.longitude != null) score += 100;
  if (shop.address) score += 10;
  if (shop.updatedAt) score += new Date(shop.updatedAt).getTime() / 1e13;
  return score;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const shops = await prisma.shop.findMany({
    where: {
      externalId: {
        not: null,
      },
    },
    select: {
      id: true,
      userId: true,
      name: true,
      externalId: true,
      address: true,
      latitude: true,
      longitude: true,
      updatedAt: true,
    },
    orderBy: [{ userId: "asc" }, { updatedAt: "desc" }],
  });

  const groups = new Map();
  const normalizationUpdates = [];

  for (const shop of shops) {
    const normalizedExternalId = normalizeExternalId(shop.externalId);
    if (!normalizedExternalId) {
      continue;
    }

    if (normalizedExternalId !== shop.externalId) {
      normalizationUpdates.push({
        id: shop.id,
        name: shop.name,
        from: shop.externalId,
        to: normalizedExternalId,
      });
    }

    const groupKey = `${shop.userId || "global"}::${normalizedExternalId}`;
    const list = groups.get(groupKey) || [];
    list.push({
      ...shop,
      normalizedExternalId,
    });
    groups.set(groupKey, list);
  }

  const duplicateGroups = Array.from(groups.values()).filter((group) => group.length > 1);

  console.log(`扫描店铺 ${shops.length} 条，发现重复组 ${duplicateGroups.length} 组。`);

  if (normalizationUpdates.length > 0) {
    console.log(`需要标准化 externalId 的店铺 ${normalizationUpdates.length} 条。`);
  }

  for (const group of duplicateGroups) {
    group.sort((a, b) => scoreShop(b) - scoreShop(a));
    const keeper = group[0];
    const duplicates = group.slice(1);

    console.log(`\n保留 POI_ID ${keeper.normalizedExternalId} -> ${keeper.name} (${keeper.id})`);
    for (const duplicate of duplicates) {
      console.log(`清空重复项 -> ${duplicate.name} (${duplicate.id})`);
    }
  }

  if (dryRun) {
    console.log("\n当前为 dry-run，只输出结果，不写入数据库。");
    return;
  }

  for (const update of normalizationUpdates) {
    await prisma.shop.update({
      where: { id: update.id },
      data: { externalId: update.to },
    });
  }

  for (const group of duplicateGroups) {
    group.sort((a, b) => scoreShop(b) - scoreShop(a));
    const duplicates = group.slice(1);

    for (const duplicate of duplicates) {
      await prisma.shop.update({
        where: { id: duplicate.id },
        data: { externalId: null },
      });
    }
  }

  console.log("\n重复 POI_ID 已清理完成，现在可以重新执行 prisma db push。");
}

main()
  .catch((error) => {
    console.error("修复失败:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
