/**
 * 一次性老数据时区修复脚本
 *
 * 背景：服务器原运行在 UTC，导致出库单 `date` 字段比实际创建时间快约 8 小时。
 * 本脚本找出所有仍存在该偏差的记录，将 date 修正为 createdAt。
 *
 * 运行方式（在项目根目录执行）：
 *   npx tsx scripts/fix-timezone-historical.ts
 *
 * 注意事项：
 * - 脚本默认先执行 DRY RUN（只扫描，不写库），确认无误后改 DRY_RUN = false 再执行
 * - 建议在低峰期执行，执行前做一次数据库备份
 */

import { PrismaClient } from "../prisma/generated-client";

const prisma = new PrismaClient();

// ★ 确认无误后改为 false 正式执行
const DRY_RUN = true;

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
const MARGIN_MS = 30 * 60 * 1000; // 30 分钟容差
const BATCH_SIZE = 500;

async function main() {
  console.log(`\n===== 出库单历史时区修复脚本 =====`);
  console.log(`模式: ${DRY_RUN ? "DRY RUN（仅扫描，不修改数据）" : "正式执行（将写入数据库）"}`);
  console.log(`时间: ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}\n`);

  let cursor: string | undefined = undefined;
  let totalScanned = 0;
  let totalMatched = 0;
  let totalFixed = 0;

  while (true) {
    type OutboundRecord = { id: string; date: Date; createdAt: Date };
    const batch: OutboundRecord[] = await prisma.outboundOrder.findMany({
      select: { id: true, date: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    if (batch.length === 0) break;

    cursor = batch[batch.length - 1].id;
    totalScanned += batch.length;

    const toFix = batch.filter((item: OutboundRecord) => {
      const diffMs = item.date.getTime() - item.createdAt.getTime();
      return Math.abs(diffMs - EIGHT_HOURS_MS) < MARGIN_MS;
    });

    totalMatched += toFix.length;

    if (toFix.length > 0) {
      console.log(`  批次扫描 ${batch.length} 条，命中 ${toFix.length} 条需修复：`);
      for (const item of toFix) {
        const wrongDate = item.date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
        const correctDate = item.createdAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
        console.log(`    [${item.id}] date: ${wrongDate}  ->  ${correctDate}`);

        if (!DRY_RUN) {
          await prisma.outboundOrder.update({
            where: { id: item.id },
            data: { date: item.createdAt },
          });
          totalFixed++;
        }
      }
    }
  }

  console.log(`\n===== 执行结果 =====`);
  console.log(`  总扫描: ${totalScanned} 条`);
  console.log(`  命中偏差: ${totalMatched} 条`);
  if (DRY_RUN) {
    console.log(`  实际修复: 0 条（DRY RUN 模式）`);
    if (totalMatched > 0) {
      console.log(`\n发现 ${totalMatched} 条需修复。将脚本中 DRY_RUN 改为 false 后重新运行即可正式修复。`);
    } else {
      console.log(`\n未发现任何偏差记录，数据库已干净，无需修复。`);
    }
  } else {
    console.log(`  实际修复: ${totalFixed} 条`);
    console.log(`\n修复完成。`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("脚本执行失败:", err);
  prisma.$disconnect();
  process.exit(1);
});
