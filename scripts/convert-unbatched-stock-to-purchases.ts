/**
 * 店铺幽灵库存转正规采购记录与批次修复脚本
 * 
 * 作用：
 *   扫描全系统所有的店铺商品 (ShopProduct)，自动计算其物理库存 stock 与有效采购批次剩余数量之和的差值（gap = stock - sumRemaining）。
 *   对于存在店铺幽灵物理库存（gap > 0）的商品，自动在后台为其对应用户及店铺生成一张 Received（已入库）状态的
 *   “系统自动修复补齐库存单”及对应的采购明细批次，从而让这些库存拥有合法的流水批次，恢复正常的出库、先进先出销售扣减功能。
 * 
 * 运行方式：
 *   npx tsx scripts/convert-unbatched-stock-to-purchases.ts [--dry-run | --run] [--userId <userId>] [--sku <sku>]
 */

import prisma from "../src/lib/prisma";
import { InventoryService } from "../src/services/inventoryService";

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const current = argv[i];
    if (!current.startsWith("--")) continue;
    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args.set(key, "true");
      continue;
    }
    args.set(key, next);
    i++;
  }
  return {
    dryRun: args.get("dry-run") === "true" || !args.has("run"),
    run: args.get("run") === "true",
    userId: args.get("userId") || null,
    sku: args.get("sku") || null,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🚀 开始执行：店铺有物理库存无入库批次（幽灵库存）通用自动转化工具");
  console.log(`📂 运行模式: ${options.run ? "【正式执行修复 (--run)】" : "【诊断对账试运行 (--dry-run)】"}`);
  if (options.userId) console.log(`👤 过滤用户ID: ${options.userId}`);
  if (options.sku) console.log(`🏷 过滤商品SKU: ${options.sku}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // 1. 扫描所有店铺商品 ShopProduct
  const shopProducts = await prisma.shopProduct.findMany({
    where: {
      ...(options.sku ? { sku: options.sku } : {}),
      shop: {
        ...(options.userId ? { userId: options.userId } : {}),
      },
    },
    include: {
      shop: { select: { userId: true, name: true } },
    },
  });

  let shopProductFixedCount = 0;
  console.log(`🏪 正在分析店铺商品 (共 ${shopProducts.length} 个)...`);

  for (const sp of shopProducts) {
    const shopUser = sp.shop?.userId;
    if (!shopUser) continue;

    // 聚合该店铺商品所有有效批次剩余数量之和
    const agg = await prisma.purchaseOrderItem.aggregate({
      where: {
        shopProductId: sp.id,
        remainingQuantity: { gt: 0 },
        purchaseOrder: { status: "Received" },
      },
      _sum: { remainingQuantity: true },
    });

    const sumRemaining = agg._sum.remainingQuantity ?? 0;
    const gap = sp.stock - sumRemaining;

    if (gap > 0) {
      console.log(`  ⚠ [ShopProduct] 店铺: "${sp.shop?.name}" | 商品: "${sp.productName}" | SKU: ${sp.sku || "无"} | 用户: ${shopUser}`);
      console.log(`    物理库存: ${sp.stock} | 店铺批次库存之和: ${sumRemaining} | 【幽灵差额: ${gap}】`);

      if (options.run) {
        // 在事务中创建采购入库单并补齐店铺商品批次
        await prisma.$transaction(async (tx) => {
          // A. 创建采购单
          const purchaseOrder = await tx.purchaseOrder.create({
            data: {
              userId: shopUser,
              type: "Inbound",
              status: "Received",
              date: new Date(),
              totalAmount: 0.0,
              shippingFees: 0.0,
              extraFees: 0.0,
              discountAmount: 0.0,
              note: `[系统自动修复] 补齐店铺遗留物理库存差额，幽灵库存自动转化为正规入库批次 (商品:${sp.productName})`,
            },
          });

          // B. 创建采购单商品明细批次
          const poi = await tx.purchaseOrderItem.create({
            data: {
              purchaseOrderId: purchaseOrder.id,
              shopProductId: sp.id,
              productId: sp.productId || null,
              quantity: gap,
              costPrice: sp.costPrice ?? 0.0,
              remainingQuantity: gap,
            },
          });

          // C. 处理保质期批次管理 (仅限存在主商品ID关联时，防外键约束冲突)
          if (sp.isShelfLife && sp.productId) {
            const prodDate = new Date();
            prodDate.setDate(prodDate.getDate() - 10); // 默认生产日期设为10天前

            const shelfDays = sp.shelfLifeDays || 365;
            const expDate = new Date(prodDate.getTime());
            expDate.setDate(expDate.getDate() + shelfDays);

            await tx.productBatch.create({
              data: {
                productId: sp.productId,
                shopProductId: sp.id,
                purchaseOrderItemId: poi.id,
                productionDate: prodDate,
                expirationDate: expDate,
                quantity: gap,
                remainingStock: gap,
                remark: "系统自动转换生成店铺保质期批次",
                userId: shopUser,
                batchNo: `AUTO-FIX-S-${Date.now().toString().slice(-6)}`,
              },
            });
          }

          // D. 重新计算并物理同步该店铺商品库存（这会自动联动更新主库商品）
          await InventoryService.syncStockFromBatches(tx, null, sp.id);
        });

        console.log(`    ✅ 店铺商品转化成功！自动生成 Received 状态入库单，补齐批次流水。`);
      } else {
        console.log(`    [试运行] 将为该店铺商品差额 ${gap} 生成采购单，补齐正规店铺入库批次。`);
      }
      shopProductFixedCount++;
    }
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📊 修复与转化结果汇总：");
  console.log(`   店铺商品修复项: ${shopProductFixedCount} 个`);
  console.log(`   运行模式状态: ${options.run ? "【已正式完成修复入库！】" : "【仅在试运行诊断，数据库未修改。运行参数 --run 开始正式转化】"}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main()
  .catch((e) => {
    console.error("❌ 自动转化失败：", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
