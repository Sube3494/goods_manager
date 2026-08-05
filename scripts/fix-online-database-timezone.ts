import { PrismaClient } from '../prisma/generated-client';

const onlineDbUrl = "postgresql://postgres:123456@47.98.98.18:5432/goods_manager";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: onlineDbUrl
    }
  }
});

async function fixOnlineTimezones() {
  console.log(`🚀 开始连接线上数据库 (47.98.98.18:5432/goods_manager) 进行数据修复...`);
  
  try {
    // 1. 校准特定单据 FH-20260805-QGD8
    const targetId = 'FH-20260805-QGD8';
    const specificOrder = await prisma.outboundOrder.findUnique({
      where: { id: targetId }
    });

    if (specificOrder) {
      console.log(`📌 线上数据库找到目标单据 ${targetId}:`);
      console.log(`   原业务时间 (date):      ${specificOrder.date.toISOString()}`);
      console.log(`   系统创建时间(createdAt): ${specificOrder.createdAt.toISOString()}`);
      
      const updated = await prisma.outboundOrder.update({
        where: { id: targetId },
        data: {
          date: specificOrder.createdAt
        }
      });
      console.log(`   ✅ 成功更正线上单据 ${targetId} 业务时间为 ${updated.date.toISOString()}`);
    } else {
      console.log(`❓ 线上数据库未查找到指定单据 ID: ${targetId}`);
    }

    // 2. 检查线上数据库近期的发货单
    const recentOrders = await prisma.outboundOrder.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200
    });

    console.log(`🔍 检索线上 200 张最新出库发货单...`);

    let fixCount = 0;
    for (const order of recentOrders) {
      const diffMs = order.date.getTime() - order.createdAt.getTime();
      const eightHoursMs = 8 * 60 * 60 * 1000;
      // 如果业务时间比创建时间快了大约 8 小时（误差在 30 分钟内）
      if (Math.abs(diffMs - eightHoursMs) < 30 * 60 * 1000) {
        console.log(`--------------------------------------------------`);
        console.log(`[线上校准单据 ID]: ${order.id}`);
        console.log(`  原业务时间 (date):      ${order.date.toISOString()}`);
        console.log(`  系统创建时间 (createdAt): ${order.createdAt.toISOString()}`);

        await prisma.outboundOrder.update({
          where: { id: order.id },
          data: {
            date: order.createdAt
          }
        });
        console.log(`  ✅ 修复成功 -> 已校准线上业务时间为系统创建时间。`);
        fixCount++;
      }
    }

    console.log(`--------------------------------------------------`);
    console.log(`🎉 线上数据库处理完毕！共更正校准了 ${fixCount} 张线上发货单。`);
  } catch (error) {
    console.error('❌ 连接或修缮线上数据库失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixOnlineTimezones();
