import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "../prisma/generated-client";
import { buildFactoryShipmentNote, parseFactoryShipmentNote } from "../src/lib/utils";

const prisma = new PrismaClient();

const shouldRun = process.argv.includes("--run");
// 从命令行参数寻找备份 json 文件，默认使用 factory-shipment-dates-20260806_015608.json
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
      select: { id: true, date: true, note: true, createdAt: true },
    });

    if (!existing) continue;
    checkedCount++;

    const rawBackupDate = new Date(backupOrder.date);
    const rawCreatedAt = backupOrder.createdAt ? new Date(backupOrder.createdAt) : existing.createdAt;

    // 校验备份中的 date 是否被历史 +8 小时误偏移过
    const diffHours = (rawBackupDate.getTime() - rawCreatedAt.getTime()) / 36e5;
    let correctDate = rawBackupDate;

    // 若 date 恰好比 createdAt 快约 8 小时，说明是被历史 +8 脚本偏了，纠正为真实的 createdAt
    if (Math.abs(diffHours - 8) < 0.05) {
      correctDate = rawCreatedAt;
    }

    // 更新 Note 里的每一个货品 shippedAt 时间戳
    let targetNote = existing.note || backupOrder.note || "";
    const parsedNote = parseFactoryShipmentNote(targetNote);

    if (parsedNote.isFactoryShipment && parsedNote.trackingEntries.length > 0) {
      const updatedEntries = parsedNote.trackingEntries.map((entry) => {
        if (hasTrackingNumber(entry)) {
          return {
            ...entry,
            shippedAt: entry.shippedAt || correctDate.toISOString(),
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
      console.log(`📌 需修正单据: ${backupOrder.id}`);
      if (dateNeedsUpdate) {
        console.log(`   └─ 单据时间: 当前 ${existing.date.toISOString()} -> 修正为 ${correctDate.toISOString()}${Math.abs(diffHours - 8) < 0.05 ? " (已自动纠正 8h 历史偏差)" : ""}`);
      }
      if (noteNeedsUpdate) {
        console.log(`   └─ 货品发货时间: 补齐/纠正 note 中各货品的 shippedAt 时间戳`);
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
    console.log(`🔍 检查完成：共扫描 ${checkedCount} 张单据，发现 ${fixedCount} 张单据的时间/货品发货时间需要纠正归位。`);
    console.log("💡 确认上面的修复预览无误后，加上 --run 执行真正写入数据库：");
    console.log(`   npx tsx scripts/fix-all-historical-shipment-dates.ts ${path.basename(backupPath)} --run`);
  } else {
    console.log(`✅ 全量修正完成！成功纠正并写入了 ${fixedCount} 张单据的正确发货时间及各货品独立时间戳。`);
  }
  console.log("==========================================\n");
}

main()
  .catch((err) => {
    console.error("❌ 全量修正失败:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
