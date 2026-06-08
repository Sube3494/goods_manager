import { PrismaClient } from '../prisma/generated-client';

const prisma = new PrismaClient();

async function fixOnlineDates() {
  console.log('🚀 开始将所有发货单（FactoryShipment）的时间修正为创建时间...');
  
  try {
    // 1. 查询所有发货单
    const orders = await prisma.outboundOrder.findMany({
      where: {
        type: 'FactoryShipment'
      }
    });

    console.log(`🔍 线上库中共找到 ${orders.length} 张发货单，正在分析需要修正的单据...`);

    const mismatchOrders = [];

    // 2. 找出所有业务时间与创建时间不完全相等的单据
    for (const order of orders) {
      if (order.date.getTime() !== order.createdAt.getTime()) {
        mismatchOrders.push(order);
      }
    }

    if (mismatchOrders.length === 0) {
      console.log('✨ 所有发货单的时间已全部与创建时间对准，无需修复。');
      return;
    }

    console.log(`⚠️ 共有 ${mismatchOrders.length} 张发货单的时间与创建时间不一致，开始修复...`);
    console.log('--------------------------------------------------');

    let successCount = 0;

    for (const order of mismatchOrders) {
      console.log(`[单据 ID]: ${order.id}`);
      console.log(`  原业务时间 (date):      ${order.date.toISOString()}`);
      console.log(`  创建时间 (createdAt):   ${order.createdAt.toISOString()}`);

      // 将 date 直接修正为物理创建时间 createdAt
      const updated = await prisma.outboundOrder.update({
        where: { id: order.id },
        data: {
          date: order.createdAt
        }
      });

      console.log(`  ✅ 已修正为创建时间 -> ${updated.date.toISOString()}`);
      successCount++;
      console.log('--------------------------------------------------');
    }

    console.log(`\n🎉 修复完成！成功将 ${successCount} 张发货单的时间全部修正为第一次创建时的时间。`);
  } catch (error) {
    console.error('❌ 修复失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixOnlineDates();
