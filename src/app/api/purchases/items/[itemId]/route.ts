import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUserAny } from "@/lib/auth";
import { InventoryService } from "@/services/inventoryService";
import { parseOutboundReturnMeta, getOutboundReturnedBatchQuantityMap } from "@/lib/outboundReturnMeta";

function parseCostSnapshot(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  return {
    batches: Array.isArray(raw.batches)
      ? raw.batches.flatMap((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
          const batch = entry as Record<string, unknown>;
          const purchaseOrderItemId = String(batch.purchaseOrderItemId || "").trim();
          const quantity = Math.max(0, Number(batch.quantity || 0));
          if (!purchaseOrderItemId || quantity <= 0) return [];
          return [{ purchaseOrderItemId, quantity }];
        })
      : [],
  };
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ itemId: string }> }
) {
  try {
    const user = await getAuthorizedUserAny("purchase:delete", "purchase:manage");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { itemId } = await context.params;
    const targetItemId = String(itemId || "").trim();
    if (!targetItemId) {
      return NextResponse.json({ error: "缺少批次 ID" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const purchaseItem = await tx.purchaseOrderItem.findFirst({
        where: {
          id: targetItemId,
          purchaseOrder: { userId: user.id },
        },
        include: {
          purchaseOrder: true,
        },
      });

      if (!purchaseItem) {
        throw new Error("入库批次不存在或无权访问");
      }

      const originalQuantity = Number(purchaseItem.quantity || 0);
      const remainingQuantity = Number(purchaseItem.remainingQuantity ?? originalQuantity);

      // 1. 检查是否有有效出库单明细引用该批次 (未退回的净扣减数量)
      const itemWhere: Array<{ productId?: string; shopProductId?: string }> = [
        ...(purchaseItem.shopProductId ? [{ shopProductId: purchaseItem.shopProductId }] : []),
        ...(purchaseItem.productId ? [{ productId: purchaseItem.productId }] : []),
      ];

      if (itemWhere.length > 0) {
        const outbounds = await tx.outboundOrder.findMany({
          where: {
            userId: user.id,
            items: {
              some: {
                OR: itemWhere,
              },
            },
          },
          select: {
            note: true,
            items: {
              select: { costSnapshot: true },
            },
          },
        });

        let consumedQuantity = 0;
        let returnedQuantity = 0;
        for (const outbound of outbounds) {
          returnedQuantity += getOutboundReturnedBatchQuantityMap(
            parseOutboundReturnMeta(outbound.note).returns
          ).get(targetItemId) || 0;

          for (const it of outbound.items) {
            const snapshot = parseCostSnapshot(it.costSnapshot);
            consumedQuantity += snapshot?.batches
              .filter((b) => b.purchaseOrderItemId === targetItemId)
              .reduce((sum, b) => sum + b.quantity, 0) || 0;
          }
        }

        const netConsumed = Math.max(0, consumedQuantity - returnedQuantity);
        if (netConsumed > 0) {
          throw new Error(`该批次在出库单中已有 ${netConsumed} 件出库流向记录未退回，无法删除`);
        }
      }

      // 3. 执行删除操作
      await tx.productBatch.deleteMany({
        where: { purchaseOrderItemId: targetItemId },
      });

      await tx.$executeRawUnsafe(
        `DELETE FROM "InventoryAdjustment" WHERE "purchaseOrderItemId" = $1`,
        targetItemId
      ).catch(() => null);

      await tx.purchaseOrderItem.delete({
        where: { id: targetItemId },
      });

      // 4. 检查所属采购单是否变为空单
      const remainingItems = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: purchaseItem.purchaseOrderId },
      });

      let purchaseOrderDeleted = false;
      if (remainingItems.length === 0) {
        await tx.purchaseOrder.delete({
          where: { id: purchaseItem.purchaseOrderId },
        });
        purchaseOrderDeleted = true;
      } else {
        const newTotalAmount = remainingItems.reduce(
          (sum, it) => sum + Number(it.costPrice || 0) * Number(it.quantity || 0),
          0
        );
        await tx.purchaseOrder.update({
          where: { id: purchaseItem.purchaseOrderId },
          data: { totalAmount: newTotalAmount },
        });
      }

      // 5. 重新计算并同步商品物理库存
      await InventoryService.syncStockFromBatches(
        tx,
        purchaseItem.productId || null,
        purchaseItem.shopProductId || null
      );

      let latestProductStock: number | null = null;
      let latestShopProductStock: number | null = null;

      if (purchaseItem.productId) {
        const p = await tx.product.findUnique({
          where: { id: purchaseItem.productId },
          select: { stock: true },
        });
        if (p) latestProductStock = p.stock;
      }

      if (purchaseItem.shopProductId) {
        const sp = await tx.shopProduct.findUnique({
          where: { id: purchaseItem.shopProductId },
          select: { stock: true },
        });
        if (sp) latestShopProductStock = sp.stock;
      }

      return {
        purchaseOrderDeleted,
        productId: purchaseItem.productId,
        shopProductId: purchaseItem.shopProductId,
        latestProductStock,
        latestShopProductStock,
      };
    });

    return NextResponse.json({
      success: true,
      message: "批次删除成功",
      data: result,
    });
  } catch (error) {
    console.error("Failed to delete purchase order item batch:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除批次失败" },
      { status: 400 }
    );
  }
}
