import prisma from "../src/lib/prisma";
import { FinanceMath } from "../src/lib/math";
import { AUTO_INBOUND_TYPE } from "../src/lib/purchaseOrderTypes";

const WRITE_MODE = process.argv.includes("--write");
const TARGET_TYPES = ["Return", "InternalReturn", AUTO_INBOUND_TYPE] as const;

type LegacyOrder = Awaited<ReturnType<typeof loadLegacyOrders>>[number];

async function loadLegacyOrders() {
  return prisma.purchaseOrder.findMany({
    where: {
      status: "Received",
      type: { in: [...TARGET_TYPES] },
      OR: [
        { totalAmount: 0 },
        {
          items: {
            some: {
              costPrice: 0,
            },
          },
        },
      ],
    },
    include: {
      items: {
        select: {
          id: true,
          productId: true,
          shopProductId: true,
          quantity: true,
          costPrice: true,
        },
      },
    },
    orderBy: {
      date: "asc",
    },
  });
}

async function resolveFallbackCostPrice(order: LegacyOrder, item: LegacyOrder["items"][number]) {
  const latestCostItem = await prisma.purchaseOrderItem.findFirst({
    where: {
      id: { not: item.id },
      costPrice: { gt: 0 },
      ...(item.shopProductId ? { shopProductId: item.shopProductId } : { productId: item.productId }),
      purchaseOrder: {
        status: "Received",
        date: { lte: order.date },
      },
    },
    orderBy: [
      { purchaseOrder: { date: "desc" } },
      { createdAt: "desc" },
    ],
    select: {
      costPrice: true,
    },
  });

  if (Number(latestCostItem?.costPrice) > 0) {
    return FinanceMath.add(Number(latestCostItem?.costPrice) || 0, 0);
  }

  if (item.shopProductId) {
    const shopProduct = await prisma.shopProduct.findUnique({
      where: { id: item.shopProductId },
      select: {
        costPrice: true,
        product: {
          select: {
            costPrice: true,
          },
        },
      },
    });

    const shopProductCost = Number(shopProduct?.costPrice) || Number(shopProduct?.product?.costPrice) || 0;
    if (shopProductCost > 0) {
      return FinanceMath.add(shopProductCost, 0);
    }
  }

  if (item.productId) {
    const product = await prisma.product.findUnique({
      where: { id: item.productId },
      select: {
        costPrice: true,
      },
    });

    if (Number(product?.costPrice) > 0) {
      return FinanceMath.add(Number(product?.costPrice) || 0, 0);
    }
  }

  return 0;
}

async function inspectOrder(order: LegacyOrder) {
  const itemUpdates: Array<{ id: string; from: number; to: number; quantity: number }> = [];
  const unresolvedItems: string[] = [];
  let nextTotalAmount = 0;

  for (const item of order.items) {
    let nextCostPrice = FinanceMath.add(Number(item.costPrice) || 0, 0);
    if (nextCostPrice <= 0) {
      nextCostPrice = await resolveFallbackCostPrice(order, item);
    }

    if (nextCostPrice <= 0) {
      unresolvedItems.push(item.id);
    }

    if (nextCostPrice > 0 && nextCostPrice !== Number(item.costPrice || 0)) {
      itemUpdates.push({
        id: item.id,
        from: Number(item.costPrice || 0),
        to: nextCostPrice,
        quantity: Number(item.quantity) || 0,
      });
    }

    nextTotalAmount = FinanceMath.add(
      nextTotalAmount,
      FinanceMath.multiply(nextCostPrice, Number(item.quantity) || 0)
    );
  }

  return {
    order,
    itemUpdates,
    unresolvedItems,
    currentTotalAmount: Number(order.totalAmount) || 0,
    nextTotalAmount,
    shouldUpdateTotalAmount: FinanceMath.add(Number(order.totalAmount) || 0, 0) !== nextTotalAmount,
  };
}

async function main() {
  console.log(`${WRITE_MODE ? "开始正式回填" : "开始 dry-run"} 历史入库成本与金额...\n`);

  const orders = await loadLegacyOrders();
  console.log(`发现 ${orders.length} 张待检查入库单\n`);

  let updatedOrders = 0;
  let updatedItems = 0;
  let affectedOrders = 0;
  let affectedItems = 0;
  let unresolvedOrders = 0;
  const typeCounters = new Map<string, number>();

  for (const order of orders) {
    typeCounters.set(order.type, (typeCounters.get(order.type) || 0) + 1);
    const result = await inspectOrder(order);

    const needsWrite = result.itemUpdates.length > 0 || result.shouldUpdateTotalAmount;
    if (result.unresolvedItems.length > 0) {
      unresolvedOrders += 1;
    }

    if (needsWrite) {
      affectedOrders += 1;
      affectedItems += result.itemUpdates.length;
      console.log(
        `[${order.type}] ${order.id} | total ${result.currentTotalAmount.toFixed(2)} -> ${result.nextTotalAmount.toFixed(2)} | items ${result.itemUpdates.length}${result.unresolvedItems.length > 0 ? ` | unresolved ${result.unresolvedItems.length}` : ""}`
      );
    } else if (result.unresolvedItems.length > 0) {
      console.log(`[${order.type}] ${order.id} | 无法补齐成本，未改动 ${result.unresolvedItems.length} 条明细`);
    }

    if (!WRITE_MODE || !needsWrite) {
      continue;
    }

    await prisma.$transaction(async (tx) => {
      for (const itemUpdate of result.itemUpdates) {
        await tx.purchaseOrderItem.update({
          where: { id: itemUpdate.id },
          data: { costPrice: itemUpdate.to },
        });
      }

      await tx.purchaseOrder.update({
        where: { id: order.id },
        data: { totalAmount: result.nextTotalAmount },
      });
    });

    updatedOrders += 1;
    updatedItems += result.itemUpdates.length;
  }

  console.log("\n统计摘要");
  TARGET_TYPES.forEach((type) => {
    console.log(`- ${type}: ${typeCounters.get(type) || 0}`);
  });
  console.log(`- unresolved orders: ${unresolvedOrders}`);
  console.log(`- ${WRITE_MODE ? "updated orders" : "would update orders"}: ${WRITE_MODE ? updatedOrders : affectedOrders}`);
  console.log(`- ${WRITE_MODE ? "updated items" : "would update items"}: ${WRITE_MODE ? updatedItems : affectedItems}`);

  if (!WRITE_MODE) {
    console.log("\n使用 `bun scripts/backfill-legacy-inbound-costs.ts --write` 执行正式回填。");
  }
}

main()
  .catch((error) => {
    console.error("历史入库成本回填失败：", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
