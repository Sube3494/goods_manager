const { PrismaClient } = require("../prisma/generated-client");

const prisma = new PrismaClient();
const PLACEHOLDER_PRODUCT_NO = "__manual_delivery_placeholder__";
const PLACEHOLDER_PRODUCT_NAME = "手工配送占位商品";

function isDryRun() {
  return process.argv.includes("--dry-run");
}

async function main() {
  const dryRun = isDryRun();
  const orders = await prisma.autoPickOrder.findMany({
    where: {
      platform: {
        equals: "other",
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      userId: true,
      orderNo: true,
      platform: true,
      orderTime: true,
    },
    orderBy: { orderTime: "asc" },
  });

  const skipped = [];
  let updated = 0;

  for (const order of orders) {
    const conflict = await prisma.autoPickOrder.findFirst({
      where: {
        id: { not: order.id },
        userId: order.userId,
        platform: "线下交易",
        orderNo: order.orderNo,
      },
      select: { id: true, orderNo: true },
    });

    if (conflict) {
      skipped.push({
        id: order.id,
        orderNo: order.orderNo,
        conflictId: conflict.id,
      });
      continue;
    }

    if (!dryRun) {
      await prisma.autoPickOrder.update({
        where: { id: order.id },
        data: { platform: "线下交易" },
      });
    }
    updated += 1;
  }

  if (orders.length === 0) {
    console.log("No AutoPickOrder rows with platform=other found.");
  }
  console.log(`${dryRun ? "Would update" : "Updated"} ${updated} AutoPickOrder row(s) from other to 线下交易.`);
  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length} row(s) due to unique-key conflicts:`);
    skipped.forEach((item) => {
      console.log(`- orderNo=${item.orderNo} id=${item.id} conflictsWith=${item.conflictId}`);
    });
  }

  const emptyManualOrders = await prisma.autoPickOrder.findMany({
    where: {
      items: { none: {} },
      OR: [
        { rawPayload: { path: ["channelTag"], equals: "other" } },
        { rawPayload: { path: ["channel_tag"], equals: "other" } },
        { platform: "线下交易", delivery: { not: null } },
      ],
    },
    select: {
      id: true,
      orderNo: true,
      platform: true,
      rawPayload: true,
      delivery: true,
    },
    orderBy: { orderTime: "asc" },
  });

  const placeholderTargets = emptyManualOrders.filter((order) => {
    const rawPayload = order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)
      ? order.rawPayload
      : {};
    const delivery = order.delivery && typeof order.delivery === "object" && !Array.isArray(order.delivery)
      ? order.delivery
      : {};
    const channelTag = String(rawPayload.channelTag || rawPayload.channel_tag || "").trim().toLowerCase();
    const sendFee = Number(delivery.sendFee || delivery.send_fee || 0);
    return channelTag === "other" || (order.platform === "线下交易" && Number.isFinite(sendFee) && sendFee > 0);
  });

  if (!dryRun && placeholderTargets.length > 0) {
    await prisma.autoPickOrderItem.createMany({
      data: placeholderTargets.map((order) => ({
        orderId: order.id,
        productName: PLACEHOLDER_PRODUCT_NAME,
        productNo: PLACEHOLDER_PRODUCT_NO,
        quantity: 1,
        rawPayload: {
          productName: PLACEHOLDER_PRODUCT_NAME,
          productNo: PLACEHOLDER_PRODUCT_NO,
          quantity: 1,
          isManualDeliveryPlaceholder: true,
        },
      })),
    });
  }
  console.log(`${dryRun ? "Would add" : "Added"} placeholder item(s) to ${placeholderTargets.length} manual delivery order(s) without items.`);
}

main()
  .catch((error) => {
    console.error("Failed to migrate other platform orders:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
