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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const where = {
    isActive: false,
    ...(options.userId ? { userId: options.userId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.brushProduct.findMany({
      where,
      select: {
        id: true,
        userId: true,
        productId: true,
        brushKeyword: true,
        createdAt: true,
        updatedAt: true,
        product: {
          select: {
            name: true,
            sku: true,
          },
        },
      },
      orderBy: [{ userId: "asc" }, { updatedAt: "desc" }],
    }),
    prisma.brushProduct.count({ where }),
  ]);

  console.log(`发现无效刷单商品 ${total} 条${options.userId ? `（userId=${options.userId}）` : ""}。`);

  if (items.length > 0) {
    for (const item of items) {
      console.log(
        [
          item.id,
          item.userId || "global",
          item.product?.name || "-",
          item.product?.sku || "-",
          item.productId,
          item.brushKeyword || "-",
        ].join(" | ")
      );
    }
  }

  if (options.dryRun) {
    console.log("当前为 dry-run，只输出结果，不删除数据。");
    return;
  }

  if (total === 0) {
    console.log("没有需要清理的无效刷单商品。");
    return;
  }

  const result = await prisma.brushProduct.deleteMany({ where });
  console.log(`已删除无效刷单商品 ${result.count} 条。`);
}

main()
  .catch((error) => {
    console.error("清理失败:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
