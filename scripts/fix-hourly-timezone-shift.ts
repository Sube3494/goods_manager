import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "../prisma/generated-client";
import { buildFactoryShipmentNote, parseFactoryShipmentNote } from "../src/lib/utils";

const prisma = new PrismaClient();

const shouldRun = process.argv.includes("--run");

// 从命令行参数寻找 .json 文件名
const foundJson = process.argv.find((arg) => arg.endsWith(".json"));
const jsonFilename: string = foundJson || "factory-shipment-dates-20260806_015608.json";

// 小时偏移量参数 (默认 +26 小时，例如 7月31日20:32 -> 8月1日22:32)
// 可通过命令行 --add-hours=26 或 --add-hours=34 自由指定！
const hoursArg = process.argv.find((arg) => arg.startsWith("--add-hours="));
const addHours = hoursArg ? parseFloat(hoursArg.split("=")[1]) : 26;

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

  console.log(`📊 备份中共包含 ${backupOrders.length} 张单据数据。`);
  console.log(`⏱️ 小时调整偏置: 【${addHours >= 0 ? "+" : ""}${addHours} 小时】`);
  console.log(`⚙️ 运行模式: ${shouldRun ? "【真正写入数据库修复】" : "【安全预览对比 (dry-run)】"}\n`);

  let modifiedCount = 0;

  for (const backupOrder of backupOrders) {
    const existing = await prisma.outboundOrder.findUnique({
      where: { id: backupOrder.id },
      select: { id: true, date: true, note: true },
    });

    if (!existing) continue;

    const rawBackupDate = new Date(backupOrder.date);
    // 仅在备份原始 date 的基础上加上/扣除指定的小时单位偏差
    const correctDate = new Date(rawBackupDate.getTime() + addHours * 3600000);

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

    const dateNeedsUpdate = Math.abs(existing.date.getTime() - correctDate.getTime()) > 1000;
    const noteNeedsUpdate = existing.note !== targetNote;

    if (dateNeedsUpdate || noteNeedsUpdate) {
      modifiedCount++;
      const shanghaiTargetStr = correctDate.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
      const shanghaiBackupStr = rawBackupDate.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

      console.log(`📌 单据 ${backupOrder.id}:`);
      console.log(`   └─ 发货时间: 原备份 ${shanghaiBackupStr} -> 纠正 ${addHours >= 0 ? "+" : ""}${addHours}h 后为: ${shanghaiTargetStr}`);

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
    console.log(`🔍 预览完成：共计发现 ${modifiedCount} 张发货单据的小时单位时间需要纠正归位。`);
    console.log("💡 确认上面的时间偏移无误后，添加 --run 参数即可执行真正全量数据库写入：");
    console.log(`   npx tsx scripts/fix-hourly-timezone-shift.ts ${path.basename(backupPath)} --add-hours=${addHours} --run`);
  } else {
    console.log(`✅ 修复完成！成功将 ${modifiedCount} 张单据的发货时间修正 ${addHours >= 0 ? "+" : ""}${addHours}h 并写入货品 shippedAt。`);
  }
  console.log("==========================================\n");
}

main()
  .catch((err) => {
    console.error("❌ 修复失败:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
