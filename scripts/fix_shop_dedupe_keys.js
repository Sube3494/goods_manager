const { PrismaClient } = require("../prisma/generated-client");

const prisma = new PrismaClient();

function normalizeDisplayText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparableToken(value) {
  return normalizeDisplayText(value)
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9]+/gi, "");
}

function simplifyShopName(name) {
  const normalized = normalizeDisplayText(name);
  if (!normalized) return "";

  const match = normalized.match(/[\(（](.*)[\)）]$/);
  if (match && match[1]) return normalizeDisplayText(match[1]);

  const parts = normalized
    .replace(/^私人订制轻奢礼品店/, "")
    .split(/[^\u4e00-\u9fa5a-zA-Z0-9]+/)
    .filter(Boolean);
  const lastPart = parts.pop() || "";
  if (lastPart === "店" && parts.length > 0) {
    return normalizeDisplayText((parts.pop() || "") + lastPart);
  }

  return normalizeDisplayText(
    lastPart.replace(/(生日礼物|儿童玩具|滋补燕窝|礼品店)/g, "").trim() || normalized
  );
}

function normalizeShopName(value) {
  return simplifyShopName(value);
}

function normalizeShopAddress(value) {
  return normalizeDisplayText(value);
}

function buildShopDedupeKey(shop) {
  const nameKey = normalizeComparableToken(normalizeShopName(shop.name));
  const addressKey = normalizeComparableToken(normalizeShopAddress(shop.address));
  if (nameKey && addressKey) return `${nameKey}::${addressKey}`;
  return nameKey || addressKey || "";
}

function scoreShop(shop) {
  let score = 0;
  if (shop.externalId) score += 1000;
  if (shop.latitude != null && shop.longitude != null) score += 100;
  if (shop.address) score += 20;
  if (shop.contactName) score += 10;
  if (shop.contactPhone) score += 10;
  if (shop.updatedAt) score += new Date(shop.updatedAt).getTime() / 1e13;
  return score;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const dedupeKeyColumnExists = await prisma.$queryRaw`
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'Shop' AND column_name = 'dedupeKey'
    LIMIT 1
  `;

  const shops = await prisma.shop.findMany({
    select: {
      id: true,
      userId: true,
      name: true,
      address: true,
      externalId: true,
      latitude: true,
      longitude: true,
      contactName: true,
      contactPhone: true,
      updatedAt: true,
      ...(Array.isArray(dedupeKeyColumnExists) && dedupeKeyColumnExists.length > 0
        ? { dedupeKey: true }
        : {}),
    },
    orderBy: [{ userId: "asc" }, { updatedAt: "desc" }],
  });

  const groups = new Map();
  for (const shop of shops) {
    const canonicalKey = buildShopDedupeKey(shop);
    const groupKey = `${shop.userId || "global"}::${canonicalKey || `empty:${shop.id}`}`;
    const list = groups.get(groupKey) || [];
    list.push({
      ...shop,
      canonicalKey,
    });
    groups.set(groupKey, list);
  }

  const duplicateGroups = Array.from(groups.values()).filter((group) => group[0]?.canonicalKey && group.length > 1);
  console.log(`扫描店铺 ${shops.length} 条，发现标准化重复组 ${duplicateGroups.length} 组。`);

  const updates = [];
  for (const group of groups.values()) {
    group.sort((a, b) => scoreShop(b) - scoreShop(a));
    const keeper = group[0];

    for (const [index, shop] of group.entries()) {
      const nextKey = !shop.canonicalKey
        ? null
        : index === 0
          ? shop.canonicalKey
          : `${shop.canonicalKey}::legacy::${shop.id}`;

      if (shop.dedupeKey !== nextKey) {
        updates.push({
          id: shop.id,
          name: shop.name,
          current: shop.dedupeKey,
          next: nextKey,
          canonicalKey: shop.canonicalKey,
          keeperId: keeper.id,
        });
      }
    }
  }

  if (duplicateGroups.length > 0) {
    for (const group of duplicateGroups) {
      group.sort((a, b) => scoreShop(b) - scoreShop(a));
      const keeper = group[0];
      console.log(`\n重复键 ${keeper.canonicalKey}`);
      console.log(`保留主键 -> ${keeper.name} (${keeper.id})`);
      for (const duplicate of group.slice(1)) {
        console.log(`标记历史重复 -> ${duplicate.name} (${duplicate.id})`);
      }
    }
  }

  console.log(`\n需要回填 dedupeKey 的店铺 ${updates.length} 条。`);
  if (dryRun) {
    console.log("当前为 dry-run，只输出结果，不写入数据库。");
    return;
  }

  if (!Array.isArray(dedupeKeyColumnExists) || dedupeKeyColumnExists.length === 0) {
    throw new Error("当前数据库还没有 Shop.dedupeKey 列，请先执行 prisma db push。");
  }

  for (const update of updates) {
    await prisma.shop.update({
      where: { id: update.id },
      data: { dedupeKey: update.next },
    });
  }

  console.log("\n店铺 dedupeKey 已回填完成。");
}

main()
  .catch((error) => {
    console.error("回填失败:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
