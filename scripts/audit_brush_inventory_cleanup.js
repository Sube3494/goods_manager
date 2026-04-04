const { PrismaClient } = require("../prisma/generated-client");

const prisma = new PrismaClient();

function parseArgs(argv) {
  const args = new Map();

  for (let i = 0; i < argv.length; i++) {
    const current = argv[i];
    if (!current.startsWith("--")) continue;

    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args.set(key, "true");
      continue;
    }

    args.set(key, next);
    i++;
  }

  return {
    userId: args.get("userId") || "",
    platformOrderId: args.get("platformOrderId") || "",
    json: args.get("json") === "true",
  };
}

function sumQuantity(items) {
  return items.reduce((total, item) => total + (Number(item.quantity) || 0), 0);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const brushOrders = await prisma.brushOrder.findMany({
    where: {
      platformOrderId: options.platformOrderId
        ? options.platformOrderId
        : { not: null },
      ...(options.userId ? { userId: options.userId } : {}),
    },
    include: {
      items: true,
    },
    orderBy: {
      date: "desc",
    },
  });

  const candidates = [];

  for (const brushOrder of brushOrders) {
    const platformOrderId = String(brushOrder.platformOrderId || "").trim();
    if (!platformOrderId) continue;

    const [outboundOrders, autoPurchaseOrders] = await Promise.all([
      prisma.outboundOrder.findMany({
        where: {
          userId: brushOrder.userId,
          note: {
            contains: `平台单号: ${platformOrderId}`,
          },
        },
        include: {
          items: true,
        },
      }),
      prisma.purchaseOrder.findMany({
        where: {
          userId: brushOrder.userId,
          note: {
            contains: `导入订单(单号:${platformOrderId})时库存不足`,
          },
        },
        include: {
          items: true,
        },
      }),
    ]);

    if (outboundOrders.length === 0 && autoPurchaseOrders.length === 0) {
      continue;
    }

    const outboundQuantity = outboundOrders.reduce((total, order) => total + sumQuantity(order.items), 0);
    const outboundItemCount = outboundOrders.reduce((total, order) => total + order.items.length, 0);
    const autoPurchaseQuantity = autoPurchaseOrders.reduce((total, order) => total + sumQuantity(order.items), 0);
    const autoPurchaseItemCount = autoPurchaseOrders.reduce((total, order) => total + order.items.length, 0);

    candidates.push({
      brushOrderId: brushOrder.id,
      platformOrderId,
      userId: brushOrder.userId,
      brushDate: brushOrder.date,
      brushShopName: brushOrder.shopName,
      outboundOrderId: outboundOrders[0] ? outboundOrders[0].id : null,
      outboundDate: outboundOrders[0] ? outboundOrders[0].date : null,
      outboundItemCount,
      outboundQuantity,
      autoPurchaseOrderIds: autoPurchaseOrders.map((order) => order.id),
      autoPurchaseItemCount,
      autoPurchaseQuantity,
    });
  }

  if (options.json) {
    console.log(JSON.stringify({
      scannedBrushOrders: brushOrders.length,
      candidateCount: candidates.length,
      candidates,
      warning: "当前仅审计，不自动清理。因为系统缺少出库扣减到具体入库批次的流水映射，直接删除会破坏 FIFO remainingQuantity。",
    }, null, 2));
    return;
  }

  console.log("");
  console.log("Brush Inventory Cleanup Audit");
  console.log("----------------------------------------");
  console.log(`Scanned brush orders: ${brushOrders.length}`);
  console.log(`Candidate mismatches: ${candidates.length}`);
  console.log("");

  if (candidates.length === 0) {
    console.log("No suspicious brush-order inventory records found.");
    return;
  }

  for (const candidate of candidates) {
    console.log(`Platform order: ${candidate.platformOrderId}`);
    console.log(`Brush order: ${candidate.brushOrderId}`);
    console.log(`User: ${candidate.userId || "N/A"}`);
    console.log(`Brush date: ${candidate.brushDate.toISOString()}`);
    console.log(`Brush shop: ${candidate.brushShopName || "-"}`);
    console.log(`Outbound order: ${candidate.outboundOrderId || "-"}`);
    console.log(`Outbound date: ${candidate.outboundDate ? candidate.outboundDate.toISOString() : "-"}`);
    console.log(`Outbound items/qty: ${candidate.outboundItemCount}/${candidate.outboundQuantity}`);
    console.log(`Auto inbound orders: ${candidate.autoPurchaseOrderIds.join(", ") || "-"}`);
    console.log(`Auto inbound items/qty: ${candidate.autoPurchaseItemCount}/${candidate.autoPurchaseQuantity}`);
    console.log("----------------------------------------");
  }

  console.log("Tip:");
  console.log("Use --json true to export structured output for manual cleanup or a follow-up repair script.");
  console.log("Optional filters: --userId <id> --platformOrderId <platformOrderId>");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
