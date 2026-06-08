import { PrismaClient } from '../prisma/generated-client';

const prisma = new PrismaClient();

async function fixOnlineDates() {
  console.log('🚀 开始将所有发货单（FactoryShipment）的时间修正为创建时间（+8小时时区对齐）...');
  
  try {
    // 1. 查询所有发货单
    const orders = await prisma.outboundOrder.findMany({
      where: {
        type: 'FactoryShipment'
      }
    });

    console.log(`🔍 线上库中共找到 ${orders.length} 张发货单，正在分析需要修正的单据...`);

    const mismatchOrders = [];

    // 2. 找出所有业务时间与（创建时间 + 8小时）不完全相等的单据
    for (const order of orders) {
      const targetTime = order.createdAt.getTime() + 8 * 60 * 60 * 1000;
      if (order.date.getTime() !== targetTime) {
        mismatchOrders.push(order);
      }
    }

    if (mismatchOrders.length === 0) {
      console.log('✨ 所有发货单的时间已全部与创建时间（+8小时）对准，无需修复。');
      return;
    }

    console.log(`⚠️ 共有 ${mismatchOrders.length} 张发货单的时间需要修正，开始修复...`);
    console.log('--------------------------------------------------');

    let successCount = 0;

    for (const order of mismatchOrders) {
      const targetDate = new Date(order.createdAt.getTime() + 8 * 60 * 60 * 1000);
      
      console.log(`[单据 ID]: ${order.id}`);
      console.log(`  原业务时间 (date):      ${order.date.toISOString()}`);
      console.log(`  创建时间 (createdAt):   ${order.createdAt.toISOString()}`);
      console.log(`  目标对齐时间 (+8h):     ${targetDate.toISOString()}`);

      // 将 date 修正为物理创建时间并加上 8 小时
      const updated = await prisma.outboundOrder.update({
        where: { id: order.id },
        data: {
          date: targetDate
        }
      });

      console.log(`  ✅ 已修正为创建时间(+8h) -> ${updated.date.toISOString()}`);
      successCount++;
      console.log('--------------------------------------------------');
    }

    console.log(`\n🎉 修复完成！成功将 ${successCount} 张发货单的时间修正为创建时间并顺延 8 小时对齐。`);
  } catch (error) {
    console.error('❌ 修复失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixOnlineDates();
