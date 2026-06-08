import { PrismaClient } from '../prisma/generated-client';

const prisma = new PrismaClient();

async function checkDates() {
  console.log('🚀 开始分析发货单（FactoryShipment）时间异常数据...');
  try {
    const orders = await prisma.outboundOrder.findMany({
      where: {
        type: 'FactoryShipment',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`📊 共找到 ${orders.length} 张发货单。`);
    console.log('--------------------------------------------------');

    let mismatchCount = 0;

    for (const order of orders) {
      const createdTime = order.createdAt.getTime();
      const dateVal = order.date;
      const dateTime = dateVal.getTime();
      const diffMs = Math.abs(createdTime - dateTime);
      const diffHours = diffMs / (1000 * 60 * 60);

      // 如果创建时间和单据时间的差异大于 1 分钟，或者有明显的 8 小时时区偏差，我们就列出来
      if (diffMs > 60 * 1000) {
        mismatchCount++;
        console.log(`[单据 ID]: ${order.id}`);
        console.log(`  创建时间 (createdAt): ${order.createdAt.toISOString()}`);
        console.log(`  业务时间 (date):      ${order.date.toISOString()}`);
        console.log(`  更新时间 (updatedAt): ${order.updatedAt.toISOString()}`);
        console.log(`  状态 (status):        ${order.status}`);
        console.log(`  相差小时数:          ${diffHours.toFixed(2)} 小时`);
        console.log(`  备注 (note):          ${order.note ? order.note.substring(0, 60) : '无'}`);
        console.log('--------------------------------------------------');
      }
    }

    console.log(`\n🔍 分析完毕：共发现 ${mismatchCount} 张时间与创建时间不一致的发货单。`);
  } catch (error) {
    console.error('❌ 分析失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDates();
