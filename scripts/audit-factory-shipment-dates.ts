import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "../prisma/generated-client";

const prisma = new PrismaClient();

const shouldRun = process.argv.includes("--run");
const backupDir = path.join(process.cwd(), "backups");

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function stamp(date = new Date()) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "_",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function isoLiteralDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

async function main() {
  const orders = await prisma.outboundOrder.findMany({
    where: {
      OR: [
        { type: "FactoryShipment" },
        { note: { contains: "[厂家发货]" } },
        { note: { contains: "[销售]" } },
      ],
    },
    select: {
      id: true,
      type: true,
      status: true,
      date: true,
      createdAt: true,
      updatedAt: true,
      note: true,
      items: {
        select: {
          id: true,
          productId: true,
          productVariantId: true,
          shopProductId: true,
          shopProductVariantId: true,
          variantName: true,
          variantSku: true,
          quantity: true,
          price: true,
        },
      },
    },
    orderBy: { date: "asc" },
  });

  await mkdir(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `factory-shipment-dates-${stamp()}.json`);
  await writeFile(
    backupPath,
    JSON.stringify({
      createdAt: new Date().toISOString(),
      mode: shouldRun ? "run" : "dry-run",
      count: orders.length,
      orders,
    }, null, 2),
    "utf8"
  );

  const suspicious = orders
    .map((order) => {
      const createdLiteral = isoLiteralDate(order.createdAt);
      const dateLiteral = isoLiteralDate(order.date);
      const diffHours = (order.date.getTime() - order.createdAt.getTime()) / 36e5;
      return { order, createdLiteral, dateLiteral, diffHours };
    })
    .filter(({ createdLiteral, dateLiteral, diffHours }) => (
      createdLiteral !== dateLiteral && Math.abs(diffHours - 8) < 0.02
    ));

  console.log(`已备份 ${orders.length} 张发货相关单据到: ${backupPath}`);
  console.log(`发现 ${suspicious.length} 张疑似被 +8 小时脚本改偏的单据。`);

  for (const item of suspicious) {
    console.log([
      item.order.id,
      `date=${item.order.date.toISOString()}`,
      `createdAt=${item.order.createdAt.toISOString()}`,
      `diff=${item.diffHours.toFixed(2)}h`,
    ].join(" | "));
  }

  if (!shouldRun) {
    console.log("当前为 dry-run，没有修改数据库。确认无误后再加 --run 执行。");
    return;
  }

  for (const item of suspicious) {
    await prisma.outboundOrder.update({
      where: { id: item.order.id },
      data: { date: item.order.createdAt },
    });
  }

  console.log(`已修复 ${suspicious.length} 张单据的 date 为 createdAt。`);
}

main()
  .catch((error) => {
    console.error("审计/修复发货单日期失败:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
