import { PrismaClient } from '../prisma/generated-client';

const prisma = new PrismaClient();

async function fixTimezones() {
  console.log('🚀 开始检查并修正发货单数据时间...');
  
  try {
    // 专门目标单据
    const targetId = 'FH-20260805-QGD8';
    const specificOrder = await prisma.outboundOrder.findUnique({
      where: { id: targetId }
    });

    if (specificOrder) {
      console.log(`📌 找到指定目标单据 ${targetId}:`);
      console.log(`   原业务时间 (date):      ${specificOrder.date.toISOString()}`);
      console.log(`   原系统创建时间(createdAt): ${specificOrder.createdAt.toISOString()}`);
      
      const updated = await prisma.outboundOrder.update({
        where: { id: targetId },
        data: {
          date: specificOrder.createdAt
        }
      });
      console.log(`   ✅ 成功更正 ${targetId} 业务时间为 ${updated.date.toISOString()}`);
    } else {
      console.log(`❓ 未查找到单据 ${targetId}，可能是其他开发库或环境。`);
    }

    // 检查近期 date 比 createdAt 推进了 ~8小时（即 Math.abs(date - createdAt - 8 hours) < 15 mins）的异常单据
    const recentOrders = await prisma.outboundOrder.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    let fixCount = 0;
    for (const order of recentOrders) {
      const diffMs = order.date.getTime() - order.createdAt.getTime();
      const eightHoursMs = 8 * 60 * 60 * 1000;
      // 如果 date 比 createdAt 快了大约8小时（误差在 15 分钟内），说明之前被错拼了 Z 导致往前推进了 8 小时
      if (Math.abs(diffMs - eightHoursMs) < 15 * 60 * 1000) {
        console.log(`--------------------------------------------------`);
        console.log(`[自动校准单据 ID]: ${order.id}`);
        console.log(`  原业务时间 (date):      ${order.date.toISOString()}`);
        console.log(`  系统创建时间 (createdAt): ${order.createdAt.toISOString()}`);

        await prisma.outboundOrder.update({
          where: { id: order.id },
          data: {
            date: order.createdAt
          }
        });
        console.log(`  ✅ 修复成功 -> 已校准业务时间与创建时间一致。`);
        fixCount++;
      }
    }

    console.log(`--------------------------------------------------`);
    console.log(`🎉 运行完成！共校准了 ${fixCount} 张异常单据。`);
  } catch (error) {
    console.error('❌ 执行失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixTimezones();
