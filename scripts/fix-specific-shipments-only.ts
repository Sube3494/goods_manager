import { PrismaClient } from "../prisma/generated-client";
import { parseAsShanghaiTime } from "../src/lib/dateUtils";
import { buildFactoryShipmentNote, parseFactoryShipmentNote } from "../src/lib/utils";

const prisma = new PrismaClient();

const shouldRun = process.argv.includes("--run");

// 仅修正用户指定的这 6 张发货单数据
const targetOrders: Record<string, string> = {
  "FH-20260731-N323": "2026-08-01 22:38:00",
  "FH-20260731-EJOW": "2026-08-01 22:39:00",
  "FH-20260731-2ZXP": "2026-08-01 22:38:00",
  "FH-20260731-Z2DQ": "2026-08-01 22:42:00",
  "FH-20260731-QZLA": "2026-08-01 22:45:00",
  "FH-20260731-P085": "2026-08-01 22:46:00",
};

function hasTrackingNumber(entry: { trackingNumber?: string | null }) {
  return Boolean(entry?.trackingNumber?.trim());
}

async function main() {
  console.log("📌 准备修正以下 6 张发货单的发货时间与货品时间戳：\n");
  Object.entries(targetOrders).forEach(([id, timeStr]) => {
    console.log(`  • ${id} -> 北京时间 ${timeStr}`);
  });
  console.log(`\n⚙️ 运行模式: ${shouldRun ? "【真正写入数据库】" : "【安全预览对比 (dry-run)】"}\n`);

  let successCount = 0;

  for (const [id, timeStr] of Object.entries(targetOrders)) {
    const order = await prisma.outboundOrder.findUnique({
      where: { id },
      select: { id: true, date: true, note: true },
    });

    if (!order) {
      console.log(`⚠️ 单据 ${id} 在数据库中未找到，跳过。`);
      continue;
    }

    const targetDate = parseAsShanghaiTime(timeStr);
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

    const shanghaiCurrentStr = order.date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    console.log(`📌 单据 ${id}: 当前发货时间 ${shanghaiCurrentStr} -> 修正为 ${timeStr}`);

    if (shouldRun) {
      await prisma.outboundOrder.update({
        where: { id },
        data: {
          date: targetDate,
          note: newNote,
        },
      });
      successCount++;
    }
  }

  console.log("\n==========================================");
  if (!shouldRun) {
    console.log("💡 预览完成。确认无误后，请加上 --run 执行真正数据库写入：");
    console.log("   npx tsx scripts/fix-specific-shipments-only.ts --run");
  } else {
    console.log(`🎉 成功将上述 ${successCount} 张单据的发货时间与货品 shippedAt 独立时间戳全部精准修正！`);
  }
  console.log("==========================================\n");
}

main()
  .catch((err) => {
    console.error("❌ 执行失败:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
