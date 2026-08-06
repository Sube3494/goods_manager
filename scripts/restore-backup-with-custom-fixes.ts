import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "../prisma/generated-client";
import { parseAsShanghaiTime } from "../src/lib/dateUtils";
import { buildFactoryShipmentNote, parseFactoryShipmentNote } from "../src/lib/utils";

const prisma = new PrismaClient();

const shouldRun = process.argv.includes("--run");

// 用户明确指定的 6 张标杆单据发货时间（北京时间）
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
    console.log("请确认该 JSON 文件是否存在于 backups/ 文件夹中！");
    return;
  }

  const data = JSON.parse(content);
  const backupOrders: Array<{
    id: string;
    date: string;
    createdAt?: string;
    updatedAt?: string;
    note?: string | null;
  }> = data.orders || [];

  console.log(`📊 备份文件中共有 ${backupOrders.length} 张单据数据。`);
  console.log(`⚙️ 运行模式: ${shouldRun ? "【真正写入数据库】" : "【安全预览对比 (dry-run)】"}\n`);

  let restoredCount = 0;

  for (const backupOrder of backupOrders) {
    const existing = await prisma.outboundOrder.findUnique({
      where: { id: backupOrder.id },
      select: { id: true, date: true, note: true },
    });

    if (!existing) continue;

    // 1. 确定最终正确的发货时间 (Date)
    let targetDate: Date;
    let isUserSpecified = false;

    if (userSpecifiedDates[backupOrder.id]) {
      targetDate = parseAsShanghaiTime(userSpecifiedDates[backupOrder.id]);
      isUserSpecified = true;
    } else {
      targetDate = new Date(backupOrder.date);
    }

    // 2. 构造并更新 note，为里面的每一个已填单货品补齐 shippedAt 发货时间戳
    let targetNote = existing.note || backupOrder.note || "";
    const parsedNote = parseFactoryShipmentNote(targetNote);

    if (parsedNote.isFactoryShipment && parsedNote.trackingEntries.length > 0) {
      const updatedEntries = parsedNote.trackingEntries.map((entry) => {
        if (hasTrackingNumber(entry)) {
          return {
            ...entry,
            shippedAt: entry.shippedAt || targetDate.toISOString(),
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

    const dateNeedsUpdate = Math.abs(existing.date.getTime() - targetDate.getTime()) > 1000;
    const noteNeedsUpdate = existing.note !== targetNote;

    if (dateNeedsUpdate || noteNeedsUpdate) {
      restoredCount++;
      const targetStr = targetDate.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
      const currentStr = existing.date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

      console.log(`📌 单据: ${backupOrder.id}`);
      if (dateNeedsUpdate) {
        console.log(`   └─ 发货时间: 当前 ${currentStr} -> 恢复/修正为 ${targetStr}${isUserSpecified ? " (使用你指定的准确时间)" : ""}`);
      }
      if (noteNeedsUpdate) {
        console.log(`   └─ 货品发货时间: 自动为各个填单货品绑定 shippedAt 时间戳`);
      }

      if (shouldRun) {
        await prisma.outboundOrder.update({
          where: { id: backupOrder.id },
          data: {
            date: targetDate,
            note: targetNote,
          },
        });
      }
    }
  }

  console.log("\n==========================================");
  if (!shouldRun) {
    console.log(`🔍 预览完成：找到 ${restoredCount} 张单据的发货时间/货品时间戳需要恢复或更新。`);
    console.log("💡 确认上面的差异预览无误后，添加 --run 参数即可真正写入数据库：");
    console.log(`   npx tsx scripts/restore-backup-with-custom-fixes.ts ${path.basename(backupPath)} --run`);
  } else {
    console.log(`✅ 恢复与修正成功！共计将 ${restoredCount} 张单据的发货时间与货品 shippedAt 完整写入数据库。`);
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
