const { PrismaClient } = require("../prisma/generated-client");

const prisma = new PrismaClient();

const AUTO_RETURN_NOTE_MARKER = "单据由出库退回自动产生。关联出库单:";

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

  const apply = args.get("apply") === "true";
  const dryRun = args.get("dry-run") !== "false" && !apply;
  const before = args.get("before") || "";
  const userId = args.get("userId") || "";
  const outboundId = args.get("outboundId") || "";
  const purchaseOrderId = args.get("purchaseOrderId") || "";
  const json = args.get("json") === "true";

  return { apply, dryRun, before, userId, outboundId, purchaseOrderId, json };
}

function parseBeforeDate(raw) {
  if (!raw) return null;
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) {
    throw new Error(`无效的 --before 参数: ${raw}`);
  }
  return value;
}

function extractOutboundId(note) {
  const text = String(note || "");
  const markerIndex = text.indexOf(AUTO_RETURN_NOTE_MARKER);
  if (markerIndex === -1) return "";
  return text.slice(markerIndex + AUTO_RETURN_NOTE_MARKER.length).trim();
}

async function syncStockFromBatches(productId, shopProductId) {
  if (shopProductId) {
    const aggregateResult = await prisma.purchaseOrderItem.aggregate({
      where: {
        shopProductId,
        remainingQuantity: { gt: 0 },
        purchaseOrder: { status: "Received" },
      },
      _sum: {
        remainingQuantity: true,
      },
    });

    const sum = aggregateResult._sum.remainingQuantity || 0;
    await prisma.shopProduct.update({
      where: { id: shopProductId },
      data: { stock: sum },
    });

    const shopProduct = await prisma.shopProduct.findUnique({
      where: { id: shopProductId },
      select: { productId: true },
    });

    if (shopProduct?.productId) {
      await syncStockFromBatches(shopProduct.productId, null);
    }
    return;
  }

  if (productId) {
    const aggregateResult = await prisma.purchaseOrderItem.aggregate({
      where: {
        productId,
        remainingQuantity: { gt: 0 },
        purchaseOrder: { status: "Received" },
      },
      _sum: {
        remainingQuantity: true,
      },
    });

    const sum = aggregateResult._sum.remainingQuantity || 0;
    await prisma.product.update({
      where: { id: productId },
      data: { stock: sum },
    });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const beforeDate = parseBeforeDate(options.before);

  if (options.apply && !options.outboundId && !options.purchaseOrderId && !beforeDate) {
    throw new Error("执行修复时请至少提供 --outboundId、--purchaseOrderId 或 --before，避免误修全库。");
  }

  const where = {
    status: "Received",
    note: {
      contains: AUTO_RETURN_NOTE_MARKER,
    },
    ...(options.userId ? { userId: options.userId } : {}),
    ...(options.purchaseOrderId ? { id: options.purchaseOrderId } : {}),
    ...(beforeDate ? { date: { lt: beforeDate } } : {}),
  };

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where,
    include: {
      items: {
        select: {
          id: true,
          productId: true,
          shopProductId: true,
          quantity: true,
          remainingQuantity: true,
          costPrice: true,
        },
      },
    },
    orderBy: {
      date: "asc",
    },
  });

  const linkedOutboundIds = Array.from(
    new Set(
      purchaseOrders
        .map((order) => extractOutboundId(order.note))
        .filter(Boolean)
    )
  );

  const outboundOrders = linkedOutboundIds.length > 0
    ? await prisma.outboundOrder.findMany({
        where: {
          id: { in: linkedOutboundIds },
          ...(options.userId ? { userId: options.userId } : {}),
          ...(options.outboundId ? { id: options.outboundId } : {}),
        },
        select: {
          id: true,
          status: true,
          userId: true,
          date: true,
        },
      })
    : [];

  const outboundMap = new Map(outboundOrders.map((order) => [order.id, order]));

  const candidates = purchaseOrders
    .map((order) => {
      const linkedOutboundId = extractOutboundId(order.note);
      const outbound = linkedOutboundId ? outboundMap.get(linkedOutboundId) : null;
      const suspiciousItems = order.items.filter((item) => (item.remainingQuantity || 0) > 0);
      const duplicatedQuantity = suspiciousItems.reduce(
        (sum, item) => sum + (item.remainingQuantity || 0),
        0
      );

      return {
        purchaseOrderId: order.id,
        linkedOutboundId,
        outboundStatus: outbound?.status || "MISSING",
        userId: order.userId || "",
        date: order.date,
        suspiciousItems,
        duplicatedQuantity,
      };
    })
    .filter((candidate) => {
      if (options.outboundId && candidate.linkedOutboundId !== options.outboundId) {
        return false;
      }
      if (candidate.suspiciousItems.length === 0) {
        return false;
      }
      return candidate.outboundStatus === "Returned";
    });

  const payload = {
    mode: options.apply ? "apply" : "dry-run",
    scannedPurchaseOrders: purchaseOrders.length,
    candidateCount: candidates.length,
    candidates: candidates.map((candidate) => ({
      purchaseOrderId: candidate.purchaseOrderId,
      linkedOutboundId: candidate.linkedOutboundId,
      outboundStatus: candidate.outboundStatus,
      userId: candidate.userId,
      date: candidate.date,
      duplicatedQuantity: candidate.duplicatedQuantity,
      suspiciousItems: candidate.suspiciousItems.map((item) => ({
        id: item.id,
        productId: item.productId,
        shopProductId: item.shopProductId,
        quantity: item.quantity,
        remainingQuantity: item.remainingQuantity || 0,
      })),
    })),
    warning: "该脚本按“历史错误退回单的自动入库余量应为 0”进行修复。请先 dry-run，确认命中范围后再 apply。",
  };

  if (options.json || options.dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    if (!options.apply) {
      return;
    }
  }

  let fixedOrders = 0;
  let fixedItems = 0;
  let clearedQuantity = 0;

  for (const candidate of candidates) {
    await prisma.$transaction(async (tx) => {
      for (const item of candidate.suspiciousItems) {
        const currentRemaining = item.remainingQuantity || 0;
        if (currentRemaining <= 0) continue;

        await tx.purchaseOrderItem.update({
          where: { id: item.id },
          data: {
            remainingQuantity: 0,
          },
        });

        fixedItems += 1;
        clearedQuantity += currentRemaining;
      }
    });

    const syncTargets = new Map();
    for (const item of candidate.suspiciousItems) {
      const key = `${item.productId || ""}::${item.shopProductId || ""}`;
      syncTargets.set(key, {
        productId: item.productId || null,
        shopProductId: item.shopProductId || null,
      });
    }

    for (const target of syncTargets.values()) {
      await syncStockFromBatches(target.productId, target.shopProductId);
    }

    fixedOrders += 1;
  }

  console.log(
    JSON.stringify(
      {
        mode: "apply",
        fixedOrders,
        fixedItems,
        clearedQuantity,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("修复失败:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
