import { PrismaClient } from '../prisma/generated-client';
import { parseAsShanghaiTime } from '../src/lib/dateUtils';

const prisma = new PrismaClient();

async function fixSpecific() {
  try {
    const orderId = 'FH-20260731-N323';
    console.log(`📌 修正单据 ${orderId} 的正确发货时间为 2026-08-01 22:30:00 ...`);
    
    // 8月1号 晚上10点30分 北京时间
    const correctShipDate = parseAsShanghaiTime("2026-08-01 22:30:00");
    
    const updated = await prisma.outboundOrder.update({
      where: { id: orderId },
      data: {
        date: correctShipDate
      }
    });

    console.log(`✅ 修正成功！单据 ${orderId} 的最新发货时间为: ${updated.date.toISOString()}`);
  } catch (err) {
    console.error("❌ 修正单据失败:", err);
  } finally {
    await prisma.$disconnect();
  }
}

fixSpecific();
