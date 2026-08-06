import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "../prisma/generated-client";
import { parseAsShanghaiTime } from "../src/lib/dateUtils";
import { buildFactoryShipmentNote, parseFactoryShipmentNote } from "../src/lib/utils";

const prisma = new PrismaClient();

const shouldRun = process.argv.includes("--run");

// 用户明确指定的特殊单据发货时间（覆盖备份中的偏差数据）
const userSpecifiedDates: Record<string, string> = {
  "FH-20260731-N323": "2026-08-01 22:38:00",
  "FH-20260731-EJOW": "2026-08-01 22:39:00",
  "FH-20260731-2ZXP": "2026-08-01 22:38:00",
  "FH-20260731-Z2DQ": "2026-08-01 22:42:00",
  "FH-20260731-QZLA": "2026-08-01 22:45:00",
  "FH-20260731-P085": "2026-08-01 22:46:00",
};

const foundJson = process.argv.find((arg) => arg.endsWith(".json"));
const jsonFilename: string = foundJson || "factory-shipment-dates-20260806_015608.json";

function hasTrackingNumber(entry: { trackingNumber?: string | null }) {
  return Boolean(entry?.trackingNumber?.trim());
}

async function main() {
  const backupPath = path.isAbsolute(jsonFilename)
    ? jsonFilename
    : path.join(process.cwd(), "backups", path.basename(jsonFilename));

  console.log(`📁 正在读取备份文件: ${backupPath}`);
  let content = "";
  try {
    content = await readFile(backupPath, "utf8");
  } catch {
    console.error(`❌ 未能读取到备份文件: ${backupPath}`);
    console.log("请确认文件是否存在于 backups 目录下！");
    return;
  }

  const data = JSON.parse(content);
  const backupOrders: Array<{
    id: string;
    date: string;
    createdAt?: string;
    note?: string | null;
  }> = data.orders || [];

  console.log(`📊 备份中共找到 ${backupOrders.length} 张发货相关单据数据。`);
  console.log(`⚙️ 运行模式: ${shouldRun ? "【真正写入数据库修复】" : "【仅预览对比 (dry-run)】"}\n`);

  let checkedCount = 0;
  let fixedCount = 0;

  for (const backupOrder of backupOrders) {
    const existing = await prisma.outboundOrder.findUnique({
      where: { id: backupOrder.id },
      select: { id: true, date: true, note: true },
    });

    if (!existing) continue;
    checkedCount++;

    // 优先采用用户明确指定的时间，否则取备份 JSON 中的真实发货时间 backupOrder.date
    let correctDate: Date;
    if (userSpecifiedDates[backupOrder.id]) {
      correctDate = parseAsShanghaiTime(userSpecifiedDates[backupOrder.id]);
    } else {
      correctDate = new Date(backupOrder.date);
    }

    // 将此发货时间注入更新到 Note 里的每个已填单货品 shippedAt 时间戳中
    let targetNote = existing.note || backupOrder.note || "";
    const parsedNote = parseFactoryShipmentNote(targetNote);

    if (parsedNote.isFactoryShipment && parsedNote.trackingEntries.length > 0) {
      const updatedEntries = parsedNote.trackingEntries.map((entry) => {
        if (hasTrackingNumber(entry)) {
          return {
            ...entry,
            shippedAt: correctDate.toISOString(),
          };
        }
        return entry;
      });

      targetNote = buildFactoryShipmentNote({
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

    const dateNeedsUpdate = existing.date.getTime() !== correctDate.getTime();
    const noteNeedsUpdate = existing.note !== targetNote;

    if (dateNeedsUpdate || noteNeedsUpdate) {
      fixedCount++;
      console.log(`📌 需恢复单据: ${backupOrder.id}`);
      if (dateNeedsUpdate) {
        console.log(`   └─ 发货时间: 当前 ${existing.date.toISOString()} -> 恢复为 ${correctDate.toISOString()}${userSpecifiedDates[backupOrder.id] ? " (已使用你指定的准确时间)" : ""}`);
      }
      if (noteNeedsUpdate) {
        console.log(`   └─ 货品发货时间: 注入/更新各个货品记录的 shippedAt 时间戳`);
      }

      if (shouldRun) {
        await prisma.outboundOrder.update({
          where: { id: backupOrder.id },
          data: {
            date: correctDate,
            note: targetNote,
          },
        });
      }
    }
  }

  console.log("\n==========================================");
  if (!shouldRun) {
    console.log(`🔍 检查完成：共扫描 ${checkedCount} 张单据，发现 ${fixedCount} 张单据的发货时间/货品独立时间需要恢复归位。`);
    console.log("💡 确认上面的恢复预览无误后，加上 --run 执行真正写入数据库：");
    console.log(`   npx tsx scripts/fix-all-historical-shipment-dates.ts ${path.basename(backupPath)} --run`);
  } else {
    console.log(`✅ 恢复完成！成功将 ${fixedCount} 张单据的发货时间及各货品独立时间戳全量准确写入。`);
  }
  console.log("==========================================\n");
}

main()
  .catch((err) => {
    console.error("❌ 恢复失败:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
