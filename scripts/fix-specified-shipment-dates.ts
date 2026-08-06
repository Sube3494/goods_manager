import { PrismaClient } from "../prisma/generated-client";
import { parseAsShanghaiTime } from "../src/lib/dateUtils";
import { buildFactoryShipmentNote, parseFactoryShipmentNote } from "../src/lib/utils";

const prisma = new PrismaClient();

const targetOrders = [
  { id: "FH-20260731-N323", targetTimeStr: "2026-08-01 22:38:00" },
  { id: "FH-20260731-EJOW", targetTimeStr: "2026-08-01 22:39:00" },
  { id: "FH-20260731-2ZXP", targetTimeStr: "2026-08-01 22:38:00" },
  { id: "FH-20260731-Z2DQ", targetTimeStr: "2026-08-01 22:42:00" },
  { id: "FH-20260731-QZLA", targetTimeStr: "2026-08-01 22:45:00" },
  { id: "FH-20260731-P085", targetTimeStr: "2026-08-01 22:46:00" },
];

function hasTrackingNumber(entry: { trackingNumber?: string | null }) {
  return Boolean(entry?.trackingNumber?.trim());
}

async function main() {
  console.log("🚀 开始修正指定 6 张单据的发货时间与货品发货时间戳...\n");

  for (const item of targetOrders) {
    const order = await prisma.outboundOrder.findUnique({
      where: { id: item.id },
      select: { id: true, date: true, note: true },
    });

    if (!order) {
      console.log(`⚠️ 单据 ${item.id} 在数据库中未找到，跳过。`);
      continue;
    }

    const targetDate = parseAsShanghaiTime(item.targetTimeStr);
    const parsedNote = parseFactoryShipmentNote(order.note || "");

    let newNote = order.note || "";
    if (parsedNote.isFactoryShipment && parsedNote.trackingEntries.length > 0) {
      const updatedEntries = parsedNote.trackingEntries.map((entry) => {
        if (hasTrackingNumber(entry)) {
          return {
            ...entry,
            shippedAt: targetDate.toISOString(),
          };
        }
        return entry;
      });

      newNote = buildFactoryShipmentNote({
        recipientName: parsedNote.recipientName,
        recipientPhone: parsedNote.recipientPhone,
        paymentStatus: parsedNote.paymentStatus,
        compensationStatus: parsedNote.compensationStatus,
        recipientAddress: parsedNote.recipientAddress,
        trackingEntries: updatedEntries,
        remark: parsedNote.remark,
        compensationLogisticsName: parsedNote.compensationLogisticsName,
        compensationTrackingNumber: parsedNote.compensationTrackingNumber,
        compensationItems: parsedNote.compensationItems,
      });
    }

    await prisma.outboundOrder.update({
      where: { id: item.id },
      data: {
        date: targetDate,
        note: newNote,
      },
    });

    console.log(`✅ 单据 ${item.id} 成功修正发货时间为: ${item.targetTimeStr}`);
  }

  console.log("\n🎉 所有指定单据的数据修正完成！");
}

main()
  .catch((err) => {
    console.error("❌ 修正数据失败:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
