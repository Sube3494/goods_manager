import prisma from "@/lib/prisma";
import { InventoryService } from "@/services/inventoryService";
import { FinanceMath } from "@/lib/math";
import {
  buildOutboundReturnMetaNote,
  getOutboundReturnedBatchQuantityMap,
  getOutboundReturnedQuantityMap,
  parseOutboundReturnMeta,
  type OutboundReturnMetaEntry,
} from "@/lib/outboundReturnMeta";
import { randomUUID } from "crypto";

interface ReturnOutboundItemInput {
  outboundOrderItemId: string;
  quantity: number;
}

interface ReturnOutboundOrderInput {
  reason?: string;
  refundAmount?: number;
  extraExpense?: number;
  items?: ReturnOutboundItemInput[];
}

function parseCostSnapshot(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  return {
    quantity: Math.max(0, Number(raw.quantity || 0)),
    totalCost: Number(raw.totalCost || 0) || 0,
    averageUnitCost: Number(raw.averageUnitCost || 0) || 0,
    batches: Array.isArray(raw.batches)
      ? raw.batches.flatMap((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return [];
          }
          const batch = entry as Record<string, unknown>;
          const purchaseOrderItemId = String(batch.purchaseOrderItemId || "").trim();
          const quantity = Math.max(0, Number(batch.quantity || 0));
          if (!purchaseOrderItemId || quantity <= 0) {
            return [];
          }
          return [{
            purchaseOrderItemId,
            quantity,
            unitCost: Number(batch.unitCost || 0) || 0,
          }];
        })
      : [],
  };
}

export async function returnOutboundOrderById(
  userId: string,
  outboundOrderId: string,
  input: string | ReturnOutboundOrderInput = "退货入库"
) {
  const payload = typeof input === "string" ? { reason: input } : input;
  const reason = String(payload.reason || "退货入库").trim() || "退货入库";

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

    const parsedReturnMeta = parseOutboundReturnMeta(order.note);
    const existingReturns = parsedReturnMeta.returns;
    const returnedQuantityMap = getOutboundReturnedQuantityMap(existingReturns);
    const returnedBatchQuantityMap = getOutboundReturnedBatchQuantityMap(existingReturns);

    const requestedItems = Array.isArray(payload.items) && payload.items.length > 0
      ? payload.items
        .map((item) => ({
          outboundOrderItemId: String(item.outboundOrderItemId || "").trim(),
          quantity: Math.max(0, Number(item.quantity || 0)),
        }))
        .filter((item) => item.outboundOrderItemId && item.quantity > 0)
      : order.items.map((item) => ({
          outboundOrderItemId: item.id,
          quantity: Math.max(0, item.quantity - (returnedQuantityMap.get(item.id) || 0)),
        })).filter((item) => item.quantity > 0);

    if (requestedItems.length === 0) {
      throw new Error("No returnable items found");
    }

    const requestMap = new Map(requestedItems.map((item) => [item.outboundOrderItemId, item.quantity]));
    const inboundItems: Array<{
      productId: string | null;
      shopProductId: string | null;
      quantity: number;
      remainingQuantity: number;
      costPrice: number;
    }> = [];
    let inboundTotalAmount = 0;
    let returnedItemCount = 0;
    const returnMetaItems: OutboundReturnMetaEntry["items"] = [];

    for (const item of order.items) {
      const requestedQuantity = requestMap.get(item.id) || 0;
      if (requestedQuantity <= 0) {
        continue;
      }

      const alreadyReturnedQuantity = returnedQuantityMap.get(item.id) || 0;
      const remainingReturnableQuantity = Math.max(0, item.quantity - alreadyReturnedQuantity);
      if (requestedQuantity > remainingReturnableQuantity) {
        throw new Error(`商品「${item.shopProduct?.productName || "未命名商品"}」最多还能退 ${remainingReturnableQuantity} 件`);
      }

      let amountToRestore = requestedQuantity;
      let restoredAmount = 0;
      const snapshot = parseCostSnapshot(item.costSnapshot);
      const restoredBatches: NonNullable<OutboundReturnMetaEntry["items"][number]["batches"]> = [];

      if (snapshot?.batches?.length) {
        for (const batch of snapshot.batches) {
          if (amountToRestore <= 0) break;

          const alreadyReturnedBatchQuantity = returnedBatchQuantityMap.get(batch.purchaseOrderItemId) || 0;
          const batchReturnableQuantity = Math.max(0, batch.quantity - alreadyReturnedBatchQuantity);
          const restoreToThisBatch = Math.min(batchReturnableQuantity, amountToRestore);
          if (restoreToThisBatch <= 0) continue;

          await tx.purchaseOrderItem.update({
            where: { id: batch.purchaseOrderItemId },
            data: {
              remainingQuantity: {
                increment: restoreToThisBatch,
              },
            },
          });

          await tx.productBatch.updateMany({
            where: { purchaseOrderItemId: batch.purchaseOrderItemId },
            data: {
              remainingStock: {
                increment: restoreToThisBatch,
              },
            },
          });

          restoredAmount = FinanceMath.add(
            restoredAmount,
            FinanceMath.multiply(Number(batch.unitCost) || 0, restoreToThisBatch)
          );
          restoredBatches.push({
            purchaseOrderItemId: batch.purchaseOrderItemId,
            quantity: restoreToThisBatch,
            unitCost: Number(batch.unitCost) || 0,
          });
          amountToRestore -= restoreToThisBatch;
        }
      }

      if (amountToRestore > 0) {
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
            restoredBatches.push({
              purchaseOrderItemId: batch.id,
              quantity: restoreToThisBatch,
              unitCost: Number(batch.costPrice) || 0,
            });
            amountToRestore -= restoreToThisBatch;
          }
        }
      }

      const fallbackCostPrice = Number(item.shopProduct?.costPrice) || 0;
      const missingQuantity = Math.max(0, amountToRestore);
      const itemTotalAmount = FinanceMath.add(
        restoredAmount,
        FinanceMath.multiply(fallbackCostPrice, missingQuantity)
      );
      const itemCostPrice = requestedQuantity > 0
        ? FinanceMath.divide(itemTotalAmount, requestedQuantity)
        : fallbackCostPrice;

      inboundTotalAmount = FinanceMath.add(inboundTotalAmount, itemTotalAmount);
      returnedItemCount += requestedQuantity;
      inboundItems.push({
        productId: item.productId || null,
        shopProductId: item.shopProductId || null,
        quantity: requestedQuantity,
        remainingQuantity: requestedQuantity,
        costPrice: itemCostPrice,
      });
      returnMetaItems.push({
        outboundOrderItemId: item.id,
        productId: item.productId || null,
        shopProductId: item.shopProductId || null,
        quantity: requestedQuantity,
        name: item.shopProduct?.productName || null,
        batches: restoredBatches,
      });
    }

    if (inboundItems.length === 0 || returnedItemCount <= 0) {
      throw new Error("No valid return quantity found");
    }

    const inboundType = order.type === "Sample" ? "InternalReturn" : "Return";
    const inboundOrder = await tx.purchaseOrder.create({
      data: {
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

    const newReturnEntry: OutboundReturnMetaEntry = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      reason,
      refundAmount: Math.max(0, Number(payload.refundAmount || 0)),
      extraExpense: Math.max(0, Number(payload.extraExpense || 0)),
      returnedCost: inboundTotalAmount,
      inboundOrderId: inboundOrder.id,
      items: returnMetaItems,
    };
    const nextReturns = [...existingReturns, newReturnEntry];
    const nextReturnedMap = getOutboundReturnedQuantityMap(nextReturns);
    const isFullyReturned = order.items.every((item) => {
      const returnedQty = nextReturnedMap.get(item.id) || 0;
      return returnedQty >= item.quantity;
    });

    return tx.outboundOrder.update({
      where: { id: order.id },
      data: {
        status: isFullyReturned ? "Returned" : "PartialReturned",
        note: buildOutboundReturnMetaNote(order.note, nextReturns, isFullyReturned ? "Returned" : "PartialReturned"),
      },
    });
  });
}
