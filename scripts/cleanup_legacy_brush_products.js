const { PrismaClient } = require("../prisma/generated-client");

const prisma = new PrismaClient();

function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run"),
    userId: (() => {
      const index = argv.indexOf("--userId");
      if (index === -1) return "";
      return String(argv[index + 1] || "").trim();
    })(),
  };
}

function normalizeSku(value) {
  return String(value || "").trim().toLowerCase();
}

function buildKey(userId, shopId, token) {
  return `${userId || "global"}::${shopId || "unknown"}::${token || "unknown"}`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const baseWhere = {
    isActive: true,
    ...(options.userId ? { userId: options.userId } : {}),
  };

  const [legacyRows, modernRows] = await Promise.all([
    prisma.brushProduct.findMany({
      where: {
        ...baseWhere,
        shopProductId: null,
      },
      select: {
        id: true,
        userId: true,
        productId: true,
        shopId: true,
        brushKeyword: true,
        product: {
          select: {
            sku: true,
            name: true,
          },
        },
        shop: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ userId: "asc" }, { shopId: "asc" }, { createdAt: "asc" }],
    }),
    prisma.brushProduct.findMany({
      where: {
        ...baseWhere,
        NOT: {
          shopProductId: null,
        },
      },
      select: {
        id: true,
        userId: true,
        productId: true,
        shopProductId: true,
        shopProduct: {
          select: {
            id: true,
            shopId: true,
            productId: true,
            sourceProductId: true,
            sku: true,
          },
        },
      },
    }),
  ]);

  if (legacyRows.length === 0) {
    console.log(`没有需要清理的旧刷单商品${options.userId ? `（userId=${options.userId}）` : ""}。`);
    return;
  }

  const modernByShopSku = new Set();
  const modernByShopProductId = new Set();
  const modernByUserSku = new Set();
  const modernByUserProductId = new Set();

  for (const row of modernRows) {
    const userId = row.userId || "global";
    const shopId = row.shopProduct?.shopId || "";
    const sku = normalizeSku(row.shopProduct?.sku);
    const productTokens = [
      row.shopProduct?.sourceProductId,
      row.shopProduct?.productId,
      row.productId,
    ]
      .map((item) => String(item || "").trim())
      .filter(Boolean);

    if (sku) {
      modernByUserSku.add(buildKey(userId, "", sku));
      if (shopId) {
        modernByShopSku.add(buildKey(userId, shopId, sku));
      }
    }

    for (const token of productTokens) {
      modernByUserProductId.add(buildKey(userId, "", token));
      if (shopId) {
        modernByShopProductId.add(buildKey(userId, shopId, token));
      }
    }
  }

  const deletable = [];
  const kept = [];

  for (const row of legacyRows) {
    const userId = row.userId || "global";
    const shopId = row.shopId || "";
    const sku = normalizeSku(row.product?.sku);
    const productId = String(row.productId || "").trim();

    const matchedByShopSku = Boolean(shopId && sku && modernByShopSku.has(buildKey(userId, shopId, sku)));
    const matchedByShopProductId = Boolean(
      shopId && productId && modernByShopProductId.has(buildKey(userId, shopId, productId))
    );
    const matchedByUserSku = Boolean(!shopId && sku && modernByUserSku.has(buildKey(userId, "", sku)));
    const matchedByUserProductId = Boolean(
      !shopId && productId && modernByUserProductId.has(buildKey(userId, "", productId))
    );

    const reason =
      matchedByShopSku
        ? "same-shop-sku"
        : matchedByShopProductId
        ? "same-shop-product"
        : matchedByUserSku
        ? "user-sku-covered"
        : matchedByUserProductId
        ? "user-product-covered"
        : "";

    if (reason) {
      deletable.push({
        id: row.id,
        reason,
        sku: row.product?.sku || "",
        name: row.product?.name || "",
        shopName: row.shop?.name || "",
        productId,
      });
    } else {
      kept.push(row);
    }
  }

  console.log(
    `旧刷单商品扫描完成：总计 ${legacyRows.length} 条，可删除 ${deletable.length} 条，保留 ${kept.length} 条${options.userId ? `（userId=${options.userId}）` : ""}。`
  );

  if (deletable.length > 0) {
    for (const item of deletable.slice(0, 100)) {
      console.log(
        [
          "DELETE",
          item.id,
          item.shopName || "未分店铺",
          item.sku || "-",
          item.name || "-",
          item.productId || "-",
          item.reason,
        ].join(" | ")
      );
    }
    if (deletable.length > 100) {
      console.log(`... 其余 ${deletable.length - 100} 条删除记录已省略。`);
    }
  }

  if (kept.length > 0) {
    console.log("以下旧刷单商品未命中新记录覆盖，暂时保留：");
    for (const item of kept.slice(0, 100)) {
      console.log(
        [
          "KEEP",
          item.id,
          item.shop?.name || "未分店铺",
          item.product?.sku || "-",
          item.product?.name || "-",
          item.productId || "-",
        ].join(" | ")
      );
    }
    if (kept.length > 100) {
      console.log(`... 其余 ${kept.length - 100} 条保留记录已省略。`);
    }
  }

  if (options.dryRun) {
    console.log("当前为 dry-run，只输出结果，不删除数据。");
    return;
  }

  if (deletable.length === 0) {
    console.log("没有可删除的旧刷单商品。");
    return;
  }

  const result = await prisma.brushProduct.deleteMany({
    where: {
      id: { in: deletable.map((item) => item.id) },
    },
  });

  console.log(`已删除旧刷单商品 ${result.count} 条。`);
}

main()
  .catch((error) => {
    console.error("清理旧刷单商品失败:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
