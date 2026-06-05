import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { InventoryService } from "@/services/inventoryService";
import { FinanceMath } from "@/lib/math";

/**
 * 实现“退货入库”逻辑 (对冲出库)
 * 不再物理删除，而是标记状态并恢复库存
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "outbound:manage")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { reason } = await request.json().catch(() => ({ reason: "退货入库" }));

    // Use a transaction to reverse stock and update status
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.outboundOrder.findUnique({
        where: { id, userId: session.id },
        include: {
          items: {
            include: {
              shopProduct: true
            }
          }
        }
      });

      if (!order) {
        throw new Error("Order not found");
      }

      // 防止重复冲销
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

      // 1. Reverse stock for each item
      for (const item of order.items) {
        let amountToRestore = item.quantity;
        let restoredAmount = 0;

        // Find batches (PurchaseOrderItems) that need restoring
        // We restore to the latest available space first (LIFO restore for FIFO deduction)
        const batches = await tx.purchaseOrderItem.findMany({
          where: {
            ...(item.shopProductId ? { shopProductId: item.shopProductId } : { productId: item.productId }),
            purchaseOrder: {
              userId: session.id,
              status: "Received"
            }
          },
          orderBy: {
            purchaseOrder: {
              date: 'desc'
            }
          }
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
                  increment: restoreToThisBatch
                }
              }
            });

            // 同样增加关联的保质期批次库存 ProductBatch 的 remainingStock
            await tx.productBatch.updateMany({
              where: { purchaseOrderItemId: batch.id },
              data: {
                remainingStock: {
                  increment: restoreToThisBatch
                }
              }
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

        // 退回优先回补历史采购批次；只有历史批次无法完整容纳时，
        // 才把缺口写成新的可用入库余量，避免重复累计库存。
        inboundItems.push({
          productId: item.productId || null,
          shopProductId: item.shopProductId || null,
          quantity: item.quantity,
          remainingQuantity: missingQuantity,
          costPrice: itemCostPrice,
        });
      }

      // 2. Create a corresponding Inbound record (PurchaseOrder)
      const inboundType = order.type === "Sample" ? "InternalReturn" : "Return";
      const inboundId = `IN-${order.id.slice(-8).toUpperCase()}`; // Generate a linked ID

      await tx.purchaseOrder.create({
        data: {
          id: inboundId,
          type: inboundType,
          status: "Received",
          date: new Date(),
          totalAmount: inboundTotalAmount,
          userId: session.id,
          note: `单据由出库退回自动产生。关联出库单: ${order.id}`,
          items: {
            create: inboundItems,
          }
        }
      });

      // 3. 统一同步物理库存
      for (const item of order.items) {
        await InventoryService.syncStockFromBatches(tx, item.productId || null, item.shopProductId || null);
      }

      // 4. Update the order as "Returned" instead of deleting
      return await tx.outboundOrder.update({
        where: { id },
        data: {
          status: "Returned",
          note: order.note ? `${order.note} (已退回: ${reason})` : `(已退回: ${reason})`
        }
      });
    });

    return NextResponse.json({ success: true, order: result });
  } catch (error) {
    console.error("Failed to return outbound order:", error);
    const message = error instanceof Error ? error.message : "Failed to process return";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE remains but only for very specific cleaning (optional, maybe disable)
export async function DELETE() {
  // 业务上不再推荐直接删除，返回一个提醒或者依然执行删除
  return NextResponse.json({ error: "Please use POST /api/outbound/[id]/return instead of DELETE for audit trace." }, { status: 405 });
}
