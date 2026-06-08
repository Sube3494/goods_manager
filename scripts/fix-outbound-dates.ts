import { PrismaClient } from '../prisma/generated-client';

const prisma = new PrismaClient();

// 手动指定需要修复的4个受8小时时区误差影响的发货单ID
const targetIds = [
  'FH-20260608-L1BP',
  'FH-20260608-HL2B',
  'FH-20260608-H7KI',
  'FH-20260608-8GYQ'
];

async function fixDates() {
  console.log('🚀 开始修复指定发货单的时区误差数据...');
  
  try {
    const orders = await prisma.outboundOrder.findMany({
      where: {
        id: { in: targetIds }
      }
    });

    console.log(`🔍 找到 ${orders.length} 张待修复单据。`);

    let successCount = 0;

    for (const order of orders) {
      console.log(`--------------------------------------------------`);
      console.log(`[单据 ID]: ${order.id}`);
      console.log(`  原业务时间 (date):      ${order.date.toISOString()}`);
      console.log(`  原创建时间 (createdAt): ${order.createdAt.toISOString()}`);
      
      // 将业务时间 date 直接修正为第一次创建的时间 createdAt
      const updatedOrder = await prisma.outboundOrder.update({
        where: { id: order.id },
        data: {
          date: order.createdAt
        }
      });

      console.log(`  ✅ 修复成功 -> 新业务时间: ${updatedOrder.date.toISOString()}`);
      successCount++;
    }

    console.log(`--------------------------------------------------`);
    console.log(`🎉 修复完毕！成功修正 ${successCount} 张发货单的时间。`);
  } catch (error) {
    console.error('❌ 修复失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixDates();
