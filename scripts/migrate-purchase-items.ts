import { PrismaClient } from '../prisma/generated-client';

const prisma = new PrismaClient();

async function runMigration() {
  console.log('🚀 开始修复历史采购明细的店铺商品关联 (shopProductId)...');
  
  try {
    // 1. 查找所有 shopProductId 为空，但是 productId 不为空的采购明细
    const itemsToFix = await prisma.purchaseOrderItem.findMany({
      where: {
        shopProductId: null,
        productId: { not: null },
      },
      include: {
        purchaseOrder: true,
      }
    });

    console.log(`🔍 找到 ${itemsToFix.length} 条需要修复的采购明细。`);

    let successCount = 0;
    let failCount = 0;

    for (const item of itemsToFix) {
      const order = item.purchaseOrder;
      const productId = item.productId!;
      
      if (!order.shopName || !order.userId) {
        console.warn(`⚠️ 采购单 [ID: ${order.id}] 缺少 shopName 或 userId，跳过。`);
        failCount++;
        continue;
      }

      // 2. 根据 shopName 和 userId 找到对应的店铺 Shop
      const shop = await prisma.shop.findFirst({
        where: {
          name: order.shopName,
          userId: order.userId,
        }
      });

      if (!shop) {
        console.warn(`⚠️ 未找到属于用户 [ID: ${order.userId}] 的店铺 [名称: ${order.shopName}]，采购明细 [ID: ${item.id}] 跳过。`);
        failCount++;
        continue;
      }

      // 3. 在对应的店铺下查找对应的 ShopProduct
      const shopProduct = await prisma.shopProduct.findUnique({
        where: {
          shopId_productId: {
            shopId: shop.id,
            productId: productId,
          }
        }
      });

      if (!shopProduct) {
        console.warn(`⚠️ 店铺 [名称: ${order.shopName}] 下未找到 productId [${productId}] 的店铺商品，采购明细 [ID: ${item.id}] 跳过。`);
        failCount++;
        continue;
      }

      // 4. 更新采购明细
      await prisma.purchaseOrderItem.update({
        where: { id: item.id },
        data: { shopProductId: shopProduct.id }
      });

      console.log(`✅ 成功修复明细 [ID: ${item.id}]: 将其 shopProductId 设置为 [${shopProduct.id}]`);
      successCount++;
    }

    console.log(`\n🎉 数据清洗完毕！成功对齐 ${successCount} 条记录，跳过 ${failCount} 条记录。`);
  } catch (error) {
    console.error('❌ 数据修复失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runMigration();
