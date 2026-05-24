/**
 * 库存一次性迁移脚本
 * 将所有商品（Product 和 ShopProduct）的 stock 字段强制重算为
 * 关联 PurchaseOrderItem 批次中 remainingQuantity 之和，
 * 清除所有历史手动设置的库存数据，保证数据一致性。
 *
 * 运行方式：
 *   npx tsx scripts/migrate-stock-from-batches.ts
 */

import prisma from "../src/lib/prisma";

async function main() {
  console.log("🚀 开始库存迁移：从采购批次重算所有商品库存...\n");

  let productUpdated = 0;
  let shopProductUpdated = 0;

  // ─── 1. 重算所有 Product 库存 ───────────────────────────────────
  const products = await prisma.product.findMany({ select: { id: true, name: true, stock: true } });
  console.log(`📦 共发现 ${products.length} 个主库商品，开始重算...`);

  for (const product of products) {
    const agg = await prisma.purchaseOrderItem.aggregate({
      where: {
        productId: product.id,
        remainingQuantity: { gt: 0 },
        purchaseOrder: { status: "Received" },
      },
      _sum: { remainingQuantity: true },
    });

    const newStock = agg._sum.remainingQuantity ?? 0;

    if (product.stock !== newStock) {
      await prisma.product.update({
        where: { id: product.id },
        data: { stock: newStock },
      });
      console.log(`  ✔ [Product] ${product.name} — ${product.stock} → ${newStock}`);
      productUpdated++;
    }
  }

  // ─── 2. 重算所有 ShopProduct 库存 ──────────────────────────────
  const shopProducts = await prisma.shopProduct.findMany({
    select: { id: true, productName: true, stock: true },
  });
  console.log(`\n🏪 共发现 ${shopProducts.length} 个店铺商品，开始重算...`);

  for (const sp of shopProducts) {
    const agg = await prisma.purchaseOrderItem.aggregate({
      where: {
        shopProductId: sp.id,
        remainingQuantity: { gt: 0 },
        purchaseOrder: { status: "Received" },
      },
      _sum: { remainingQuantity: true },
    });

    const newStock = agg._sum.remainingQuantity ?? 0;

    if (sp.stock !== newStock) {
      await prisma.shopProduct.update({
        where: { id: sp.id },
        data: { stock: newStock },
      });
      console.log(`  ✔ [ShopProduct] ${sp.productName} — ${sp.stock} → ${newStock}`);
      shopProductUpdated++;
    }
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 迁移完成！
   主库商品更新：${productUpdated} / ${products.length}
   店铺商品更新：${shopProductUpdated} / ${shopProducts.length}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

main()
  .catch((e) => {
    console.error("❌ 迁移失败：", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
