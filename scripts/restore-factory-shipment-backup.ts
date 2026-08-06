import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "../prisma/generated-client";

const prisma = new PrismaClient();

const shouldRun = process.argv.includes("--run");
// 从命令行参数寻找 .json 文件名
const jsonArg = process.argv.find((arg) => arg.endsWith(".json"));

async function main() {
  if (!jsonArg) {
    console.log("❌ 请指定要恢复的备份 JSON 文件名！");
    console.log("用法示例 (仅预览):");
    console.log("  npx tsx scripts/restore-factory-shipment-backup.ts factory-shipment-dates-20260806_034433.json");
    console.log("用法示例 (真正恢复写入数据库):");
    console.log("  npx tsx scripts/restore-factory-shipment-backup.ts factory-shipment-dates-20260806_034433.json --run\n");
    return;
  }

  const backupPath = path.isAbsolute(jsonArg)
    ? jsonArg
    : path.join(process.cwd(), "backups", path.basename(jsonArg));

  console.log(`📁 正在读取备份文件: ${backupPath}`);
  const content = await readFile(backupPath, "utf8");
  const data = JSON.parse(content);

  const backupOrders: Array<{
    id: string;
    date: string;
    note?: string | null;
    createdAt?: string;
  }> = data.orders || [];

  console.log(`📊 备份文件中包含 ${backupOrders.length} 张单据数据。`);
  console.log(`⚙️ 运行模式: ${shouldRun ? "【真正写入数据库】" : "【仅预览对比 (dry-run)】"}\n`);

  let restoredCount = 0;
  let skippedCount = 0;

  for (const backupOrder of backupOrders) {
    const existing = await prisma.outboundOrder.findUnique({
      where: { id: backupOrder.id },
      select: { id: true, date: true, note: true },
    });

    if (!existing) {
      console.log(`⚠️ 单据 ${backupOrder.id} 在当前数据库中未找到，跳过。`);
      skippedCount++;
      continue;
    }

    const backupDate = new Date(backupOrder.date);
    const currentDate = existing.date;

    const dateDiffers = backupDate.getTime() !== currentDate.getTime();
    const noteDiffers = backupOrder.note !== undefined && backupOrder.note !== existing.note;

    if (dateDiffers || noteDiffers) {
      restoredCount++;
      console.log(`📌 单据: ${backupOrder.id}`);
      if (dateDiffers) {
        console.log(`   └─ 时间: 当前 ${currentDate.toISOString()} -> 恢复为备份值 ${backupDate.toISOString()}`);
      }
      if (noteDiffers) {
        console.log(`   └─ 备注/单号信息: 恢复为备份值 (${backupOrder.note || ""})`);
      }

      if (shouldRun) {
        await prisma.outboundOrder.update({
          where: { id: backupOrder.id },
          data: {
            date: backupDate,
            ...(backupOrder.note !== undefined ? { note: backupOrder.note } : {}),
          },
        });
      }
    }
  }

  console.log("\n==========================================");
  if (!shouldRun) {
    console.log(`🔍 预览结束：找到 ${restoredCount} 张可恢复单据。`);
    console.log("💡 确认上面的差异无误后，添加 --run 参数即可执行真正恢复：");
    console.log(`   npx tsx scripts/restore-factory-shipment-backup.ts ${path.basename(backupPath)} --run`);
  } else {
    console.log(`✅ 恢复完成！成功将 ${restoredCount} 张单据的时间及发货备注恢复为备份数据。`);
  }
  console.log("==========================================\n");
}

main()
  .catch((err) => {
    console.error("❌ 恢复备份失败:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
