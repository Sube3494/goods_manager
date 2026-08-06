import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "../prisma/generated-client";
import { parseAsShanghaiTime } from "../src/lib/dateUtils";
import { buildFactoryShipmentNote, parseFactoryShipmentNote } from "../src/lib/utils";

const prisma = new PrismaClient();

const shouldRun = process.argv.includes("--run");

// 6 张用户给出的精确标杆单据（精确到分钟）
const benchmarkDates: Record<string, string> = {
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

  console.log(`📁 正在读取备份文件执行全量通用推断修正: ${backupPath}`);
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
    updatedAt?: string;
    note?: string | null;
  }> = data.orders || [];

  console.log(`📊 备份中共包含 ${backupOrders.length} 张单据。`);
  console.log(`⚙️ 运行模式: ${shouldRun ? "【真正写入数据库执行修复】" : "【通用推断预览 (dry-run)】"}\n`);

  let modifiedCount = 0;

  for (const backupOrder of backupOrders) {
    const existing = await prisma.outboundOrder.findUnique({
      where: { id: backupOrder.id },
      select: { id: true, date: true, note: true },
    });

    if (!existing) continue;

    // 通用推断算法：
    // 1. 如果属于用户提供的标杆样例单据，直接精准使用标杆时间。
    // 2. 对于任何已发货单据，填单保存操作发生的时间即为真正的发货时刻 (updatedAt)。
    //    备份文件中的 date 因原系统 bug 被错赋为 createdAt + 8h，需推断纠正为 updatedAt 的真实时刻。
    let realShipDate: Date;
    let reason = "";

    if (benchmarkDates[backupOrder.id]) {
      realShipDate = parseAsShanghaiTime(benchmarkDates[backupOrder.id]);
      reason = "用户标杆精确定时";
    } else {
      const parsedNote = parseFactoryShipmentNote(backupOrder.note || "");
      const isShipped = parsedNote.trackingEntries.some(hasTrackingNumber);

      if (isShipped && backupOrder.updatedAt) {
        realShipDate = new Date(backupOrder.updatedAt);
        reason = "按真实保存填单时刻 (updatedAt) 通用推断";
      } else {
        realShipDate = new Date(backupOrder.date);
        reason = "未发货单据/无需调整";
      }
    }

    // 构造并将推断出的真实发货时间注入到 note 里的每一个已填单货品的 shippedAt 中
    let targetNote = existing.note || backupOrder.note || "";
    const parsedNote = parseFactoryShipmentNote(targetNote);

    if (parsedNote.isFactoryShipment && parsedNote.trackingEntries.length > 0) {
      const updatedEntries = parsedNote.trackingEntries.map((entry) => {
        if (hasTrackingNumber(entry)) {
          return {
            ...entry,
            shippedAt: realShipDate.toISOString(),
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

    const dateNeedsUpdate = Math.abs(existing.date.getTime() - realShipDate.getTime()) > 1000;
    const noteNeedsUpdate = existing.note !== targetNote;

    if (dateNeedsUpdate || noteNeedsUpdate) {
      modifiedCount++;
      const shanghaiTargetStr = realShipDate.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
      const shanghaiExistingStr = existing.date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

      console.log(`📌 单据: ${backupOrder.id}`);
      console.log(`   └─ 发货时间: 当前 ${shanghaiExistingStr} -> 通用推断修正为 ${shanghaiTargetStr} [${reason}]`);

      if (shouldRun) {
        await prisma.outboundOrder.update({
          where: { id: backupOrder.id },
          data: {
            date: realShipDate,
            note: targetNote,
          },
        });
      }
    }
  }

  console.log("\n==========================================");
  if (!shouldRun) {
    console.log(`🔍 全量通用推断分析完成：共计推断并拟修正 ${modifiedCount} 张发货单据的发货时刻与货品 shippedAt 时间戳。`);
    console.log("💡 确认上面的推断结果无误后，添加 --run 参数即可执行真正全量数据库写入：");
    console.log(`   npx tsx scripts/infer-historical-shipment-dates.ts ${path.basename(backupPath)} --run`);
  } else {
    console.log(`✅ 全量写入成功！共完成 ${modifiedCount} 张发货单据的真实发货时间修正与货品 shippedAt 注入。`);
  }
  console.log("==========================================\n");
}

main()
  .catch((err) => {
    console.error("❌ 执行通用推断修复失败:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
