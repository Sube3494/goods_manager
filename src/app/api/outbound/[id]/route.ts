import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";

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
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "outbound:create")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { reason } = await request.json().catch(() => ({ reason: "退货入库" }));

    // Use a transaction to reverse stock and update status
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.outboundOrder.findUnique({
        where: { id, workspaceId: session.workspaceId },
        include: { items: true }
      });

      if (!order) {
        throw new Error("Order not found");
      }

      // 防止重复冲销
      if (order.status === "Returned") {
        throw new Error("Order already returned");
      }

      // 1. Reverse stock for each item
      for (const item of order.items) {
        let amountToRestore = item.quantity;

        // Find batches (PurchaseOrderItems) that need restoring
        // We restore to the latest available space first (LIFO restore for FIFO deduction)
        const batches = await tx.purchaseOrderItem.findMany({
          where: {
            productId: item.productId,
            purchaseOrder: {
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
            amountToRestore -= restoreToThisBatch;
          }
        }

        // 2. Update the global product stock
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: {
              increment: item.quantity
            }
          }
        });
      }

      // 3. Create a corresponding Inbound record (PurchaseOrder)
      const inboundType = order.type === "Sample" ? "InternalReturn" : "Return";
      const inboundId = `IN-${order.id.slice(-8).toUpperCase()}`; // Generate a linked ID

      await tx.purchaseOrder.create({
        data: {
          id: inboundId,
          type: inboundType,
          status: "Received",
          date: new Date(),
          totalAmount: 0, // Returns don't necessarily have a transaction amount in this context
          workspaceId: session.workspaceId,
          note: `单据由出库退回自动产生。关联出库单: ${order.id}`,
          items: {
            create: order.items.map(item => ({
              productId: item.productId,
              quantity: item.quantity,
              remainingQuantity: item.quantity,
              costPrice: 0 // Financial logic might need refinement here
            }))
          }
        }
      });

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
