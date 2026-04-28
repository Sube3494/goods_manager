const { PrismaClient } = require("../prisma/generated-client");

const prisma = new PrismaClient();

function normalizeSku(value) {
  const text = String(value || "").trim();
  return text || null;
}

function scoreRow(row) {
  let score = 0;
  if (row.productId) score += 100;
  if (row.sourceProductId) score += 50;
  if (String(row.remark || "").trim() !== "自动推单补建") score += 20;
  if (row.updatedAt) score += new Date(row.updatedAt).getTime() / 1e13;
  return score;
}

async function main() {
  const rows = await prisma.shopProduct.findMany({
    select: {
      id: true,
      shopId: true,
      sku: true,
      productId: true,
      sourceProductId: true,
      productName: true,
      remark: true,
      updatedAt: true,
    },
    orderBy: [{ shopId: "asc" }, { updatedAt: "desc" }],
  });

  const groups = new Map();
  const normalizeUpdates = [];

  for (const row of rows) {
    const normalizedSku = normalizeSku(row.sku);
    if (normalizedSku !== row.sku) {
      normalizeUpdates.push({ id: row.id, sku: normalizedSku });
    }
    if (!normalizedSku) continue;

    const key = `${row.shopId}::${normalizedSku}`;
    const list = groups.get(key) || [];
    list.push({ ...row, normalizedSku });
    groups.set(key, list);
  }

  const duplicateGroups = Array.from(groups.values()).filter((group) => group.length > 1);
  console.log(`扫描店铺商品 ${rows.length} 条，发现重复 SKU 组 ${duplicateGroups.length} 组。`);

  for (const update of normalizeUpdates) {
    await prisma.shopProduct.update({
      where: { id: update.id },
      data: { sku: update.sku },
    });
  }

  for (const group of duplicateGroups) {
    group.sort((a, b) => scoreRow(b) - scoreRow(a));
    const keeper = group[0];
    const losers = group.slice(1);

    console.log(`\n保留 SKU ${keeper.normalizedSku} -> ${keeper.productName || keeper.id} (${keeper.id})`);
    for (const loser of losers) {
      console.log(`清空重复 SKU -> ${loser.productName || loser.id} (${loser.id})`);
      await prisma.shopProduct.update({
        where: { id: loser.id },
        data: { sku: null },
      });
    }
  }

  console.log("\n重复店铺 SKU 已清理完成。");
}

main()
  .catch((error) => {
    console.error("修复店铺 SKU 重复失败:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
