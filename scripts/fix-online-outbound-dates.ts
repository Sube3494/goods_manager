import { PrismaClient } from '../prisma/generated-client';

const prisma = new PrismaClient();

async function fixOnlineDates() {
  console.log('🚀 开始自动扫描并修复线上发货单（FactoryShipment）的 8 小时时区误差数据...');
  
  try {
    // 1. 查询所有发货单
    const orders = await prisma.outboundOrder.findMany({
      where: {
        type: 'FactoryShipment'
      }
    });

    console.log(`🔍 线上库中共找到 ${orders.length} 张发货单，正在进行时区偏差分析...`);

    const suspectOrders = [];

    // 2. 筛选出时间差在 7.9 到 8.1 小时之间的单据
    for (const order of orders) {
      const createdTime = order.createdAt.getTime();
      const dateTime = order.date.getTime();
      const diffHours = Math.abs(createdTime - dateTime) / (1000 * 60 * 60);

      // 判断时差是否恰好在 8 小时左右（容差 6 分钟，即 0.1 小时）
      if (diffHours >= 7.9 && diffHours <= 8.1) {
        suspectOrders.push(order);
      }
    }

    if (suspectOrders.length === 0) {
      console.log('✨ 未检测到存在 8 小时时区偏差的异常发货单，无需修复。');
      return;
    }

    console.log(`⚠️ 检测到共有 ${suspectOrders.length} 张发货单存在 8 小时时区偏差！开始执行对齐修复...`);
    console.log('--------------------------------------------------');

    let successCount = 0;

    for (const order of suspectOrders) {
      console.log(`[单据 ID]: ${order.id}`);
      console.log(`  异常业务时间 (date):      ${order.date.toISOString()}`);
      console.log(`  原始创建时间 (createdAt): ${order.createdAt.toISOString()}`);

      // 将 date 字段对准为第一次创建时的物理时间 createdAt
      const updated = await prisma.outboundOrder.update({
        where: { id: order.id },
        data: {
          date: order.createdAt
        }
      });

      console.log(`  ✅ 修复成功 -> 新业务时间已对齐为: ${updated.date.toISOString()}`);
      successCount++;
      console.log('--------------------------------------------------');
    }

    console.log(`\n🎉 修复完成！共自动识别并修正了 ${successCount} 张发货单的时间。`);
  } catch (error) {
    console.error('❌ 自动扫描修复失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixOnlineDates();
