import prisma from "@/lib/prisma";
import { InventoryService } from "@/services/inventoryService";
import { FinanceMath } from "@/lib/math";

export async function returnOutboundOrderById(userId: string, outboundOrderId: string, reason = "退货入库") {
  return prisma.$transaction(async (tx) => {
    const order = await tx.outboundOrder.findFirst({
      where: {
        id: outboundOrderId,
        userId,
      },
      include: {
        items: {
          include: {
            shopProduct: true,
          },
        },
      },
    });

    if (!order) {
      throw new Error("Order not found");
    }

    if (order.status === "Returned") {
      throw new Error("Order already returned");
    }

    const inboundItems: Array<{
      productId: string | null;
      shopProductId: string | null;
      quantity: number;
      remainingQuantity: number;
      costPrice: number;
    }> = [];
    let inboundTotalAmount = 0;

    for (const item of order.items) {
      let amountToRestore = item.quantity;
      let restoredAmount = 0;

      const batches = await tx.purchaseOrderItem.findMany({
        where: {
          ...(item.shopProductId ? { shopProductId: item.shopProductId } : { productId: item.productId }),
          purchaseOrder: {
            userId,
            status: "Received",
          },
        },
        orderBy: {
          purchaseOrder: {
            date: "desc",
          },
        },
      });

      for (const batch of batches) {
        if (amountToRestore <= 0) break;

        const currentRemaining = batch.remainingQuantity || 0;
        const originalQty = batch.quantity;
        const spaceInBatch = originalQty - currentRemaining;
        const restoreToThisBatch = Math.min(spaceInBatch, amountToRestore);

        if (restoreToThisBatch > 0) {
          await tx.purchaseOrderItem.update({
            where: { id: batch.id },
            data: {
              remainingQuantity: {
                increment: restoreToThisBatch,
              },
            },
          });

          await tx.productBatch.updateMany({
            where: { purchaseOrderItemId: batch.id },
            data: {
              remainingStock: {
                increment: restoreToThisBatch,
              },
            },
          });

          restoredAmount = FinanceMath.add(
            restoredAmount,
            FinanceMath.multiply(Number(batch.costPrice) || 0, restoreToThisBatch)
          );
          amountToRestore -= restoreToThisBatch;
        }
      }

      const fallbackCostPrice = Number(item.shopProduct?.costPrice) || 0;
      const missingQuantity = Math.max(0, amountToRestore);
      const itemTotalAmount = FinanceMath.add(
        restoredAmount,
        FinanceMath.multiply(fallbackCostPrice, missingQuantity)
      );
      const itemCostPrice = item.quantity > 0
        ? FinanceMath.divide(itemTotalAmount, item.quantity)
        : fallbackCostPrice;

      inboundTotalAmount = FinanceMath.add(inboundTotalAmount, itemTotalAmount);
      inboundItems.push({
        productId: item.productId || null,
        shopProductId: item.shopProductId || null,
        quantity: item.quantity,
        remainingQuantity: missingQuantity,
        costPrice: itemCostPrice,
      });
    }

    const inboundType = order.type === "Sample" ? "InternalReturn" : "Return";
    const inboundId = `IN-${order.id.slice(-8).toUpperCase()}`;

    await tx.purchaseOrder.create({
      data: {
        id: inboundId,
        type: inboundType,
        status: "Received",
        date: new Date(),
        totalAmount: inboundTotalAmount,
        userId,
        note: `单据由出库退回自动产生。关联出库单: ${order.id}`,
        items: {
          create: inboundItems,
        },
      },
    });

    for (const item of order.items) {
      await InventoryService.syncStockFromBatches(tx, item.productId || null, item.shopProductId || null);
    }

    return tx.outboundOrder.update({
      where: { id: order.id },
      data: {
        status: "Returned",
        note: order.note ? `${order.note} (已退回: ${reason})` : `(已退回: ${reason})`,
      },
    });
  });
}
