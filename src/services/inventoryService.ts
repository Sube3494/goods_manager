import { Prisma } from "../../prisma/generated-client";

type OutboundFifoItemSnapshot = {
  quantity: number;
  totalCost: number;
  averageUnitCost: number;
  batches: Array<{
    purchaseOrderItemId: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
  }>;
};

export type OutboundItemInput = {
  productId?: string | null;
  shopProductId?: string | null;
  quantity: number;
  batchAllocations?: Array<{
    purchaseOrderItemId: string;
    quantity: number;
  }>;
};

/**
 * 库存核心服务
 */
export class InventoryService {
  static async reconcileShelfLifeBatchesForUser(
    tx: Prisma.TransactionClient,
    userId: string
  ) {
    const batches = await tx.productBatch.findMany({
      where: {
        OR: [
          { userId },
          { product: { userId } },
        ],
        purchaseOrderItemId: { not: null },
      },
      select: {
        id: true,
        remainingStock: true,
        purchaseOrderItem: {
          select: {
            quantity: true,
            remainingQuantity: true,
            purchaseOrder: {
              select: { status: true },
            },
          },
        },
      },
    });

    for (const batch of batches) {
      const isReceived = batch.purchaseOrderItem?.purchaseOrder?.status === "Received";
      const expectedRemaining = isReceived
        ? Math.max(0, Number(batch.purchaseOrderItem?.remainingQuantity ?? batch.purchaseOrderItem?.quantity ?? 0) || 0)
        : 0;

      if (batch.remainingStock !== expectedRemaining) {
        await tx.productBatch.update({
          where: { id: batch.id },
          data: { remainingStock: expectedRemaining },
        });
      }
    }
  }

  private static async syncShelfLifeBatchesFromPurchaseItems(
    tx: Prisma.TransactionClient,
    productId: string | null,
    shopProductId: string | null
  ) {
    const batches = await tx.productBatch.findMany({
      where: {
        ...(shopProductId ? { shopProductId } : productId ? { productId } : {}),
        purchaseOrderItemId: { not: null },
        purchaseOrderItem: {
          purchaseOrder: { status: "Received" },
        },
      },
      select: {
        id: true,
        remainingStock: true,
        purchaseOrderItem: {
          select: {
            quantity: true,
            remainingQuantity: true,
          },
        },
      },
    });

    for (const batch of batches) {
      const expectedRemaining = Math.max(
        0,
        Number(batch.purchaseOrderItem?.remainingQuantity ?? batch.purchaseOrderItem?.quantity ?? 0) || 0
      );
      if (batch.remainingStock !== expectedRemaining) {
        await tx.productBatch.update({
          where: { id: batch.id },
          data: { remainingStock: expectedRemaining },
        });
      }
    }
  }

  private static resolveBatchUnitCost(batch: {
    quantity: number;
    costPrice: Prisma.Decimal | number | null;
    purchaseOrder?: {
      shippingFees?: Prisma.Decimal | number | null;
      extraFees?: Prisma.Decimal | number | null;
      items?: Array<{ id: string; quantity: number; costPrice: Prisma.Decimal | number | null }>;
    } | null;
  }) {
    let unitCost = Number(batch.costPrice || 0);
    const po = batch.purchaseOrder;
    if (po && (Number(po.shippingFees || 0) > 0 || Number(po.extraFees || 0) > 0) && Array.isArray(po.items)) {
      const totalAdditionalFees = Number(po.shippingFees || 0) + Number(po.extraFees || 0);
      const totalItemValue = po.items.reduce((sum: number, it) => sum + (Number(it.costPrice || 0) * Number(it.quantity || 0)), 0);
      const totalQuantity = po.items.reduce((sum: number, it) => sum + Number(it.quantity || 0), 0);
      const itemQty = Math.max(0, Number(batch.quantity || 0));
      if (totalItemValue > 0 && itemQty > 0) {
        const itemValue = Number(batch.costPrice || 0) * itemQty;
        const allocatedFee = totalAdditionalFees * (itemValue / totalItemValue);
        unitCost = Number(batch.costPrice || 0) + (allocatedFee / itemQty);
      } else if (totalQuantity > 0) {
        unitCost = Number(batch.costPrice || 0) + (totalAdditionalFees / totalQuantity);
      }
    }
    return unitCost;
  }

  /**
   * 处理出库扣减逻辑 (支持指定批次分配或默认 FIFO 先进先出)
   * @param tx Prisma 事务客户端
   * @param userId 操作用户 ID
   * @param items 出库明细 (支持 batchAllocations)
   */
  static async processOutboundFIFO(
    tx: Prisma.TransactionClient,
    userId: string,
    items: OutboundItemInput[]
  ): Promise<OutboundFifoItemSnapshot[]> {
    const snapshots: OutboundFifoItemSnapshot[] = [];
    for (const item of items) {
      const consumedBatches: OutboundFifoItemSnapshot["batches"] = [];

      if (!item.shopProductId && !item.productId) {
        throw new Error("出库商品缺少关联标识，无法扣减库存");
      }

      // 如果指定了具体批次分配
      if (item.batchAllocations && item.batchAllocations.length > 0) {
        const totalAllocated = item.batchAllocations.reduce((sum, a) => sum + Math.max(0, Number(a.quantity || 0)), 0);
        if (totalAllocated !== item.quantity) {
          throw new Error(`批次分配数量(${totalAllocated})与出库数量(${item.quantity})不一致`);
        }

        for (const alloc of item.batchAllocations) {
          const allocQty = Math.max(0, Number(alloc.quantity || 0));
          if (allocQty <= 0) continue;

          const batch = await tx.purchaseOrderItem.findFirst({
            where: {
              id: alloc.purchaseOrderItemId,
              purchaseOrder: {
                userId,
                status: "Received",
              },
            },
            include: {
              purchaseOrder: {
                select: {
                  shippingFees: true,
                  extraFees: true,
                  items: {
                    select: {
                      id: true,
                      quantity: true,
                      costPrice: true,
                    },
                  },
                },
              },
            },
          });

          if (!batch) {
            throw new Error(`指定的采购批次不存在或未入库：${alloc.purchaseOrderItemId}`);
          }

          const batchRemaining = Number(batch.remainingQuantity ?? 0);
          if (batchRemaining < allocQty) {
            throw new Error(`批次库存不足：批次剩余 ${batchRemaining} 件，申请出库 ${allocQty} 件`);
          }

          const updateResult = await tx.purchaseOrderItem.updateMany({
            where: {
              id: batch.id,
              remainingQuantity: { gte: allocQty },
            },
            data: {
              remainingQuantity: { decrement: allocQty },
            },
          });

          if (updateResult.count === 0) {
            throw new Error(`批次库存并发扣减冲突：批次 ${batch.id}`);
          }

          await tx.productBatch.updateMany({
            where: { purchaseOrderItemId: batch.id },
            data: { remainingStock: { decrement: allocQty } },
          });

          const unitCost = this.resolveBatchUnitCost(batch);
          consumedBatches.push({
            purchaseOrderItemId: batch.id,
            quantity: allocQty,
            unitCost,
            totalCost: unitCost * allocQty,
          });
        }
      } else {
        // 默认按先进先出 (FIFO) 自动扣减
        let remainingToDeduct = item.quantity;
        const batches = await tx.purchaseOrderItem.findMany({
          where: {
            ...(item.shopProductId ? { shopProductId: item.shopProductId } : { productId: item.productId! }),
            remainingQuantity: {
              gt: 0,
            },
            purchaseOrder: {
              userId: userId,
              status: "Received",
            },
          },
          include: {
            purchaseOrder: {
              select: {
                shippingFees: true,
                extraFees: true,
                items: {
                  select: {
                    id: true,
                    quantity: true,
                    costPrice: true,
                  },
                },
              },
            },
          },
          orderBy: {
            purchaseOrder: {
              date: "asc",
            },
          },
        });

        for (const batch of batches) {
          if (remainingToDeduct <= 0) break;

          const batchRemaining = batch.remainingQuantity || 0;
          const deductFromThisBatch = Math.min(batchRemaining, remainingToDeduct);

          const updateResult = await tx.purchaseOrderItem.updateMany({
            where: {
              id: batch.id,
              remainingQuantity: {
                gte: deductFromThisBatch,
              },
            },
            data: {
              remainingQuantity: {
                decrement: deductFromThisBatch,
              },
            },
          });

          if (updateResult.count === 0) {
            throw new Error(`并发冲突：商品 ID ${item.shopProductId || item.productId} 在该批次库存不足。请重试。`);
          }

          await tx.productBatch.updateMany({
            where: {
              purchaseOrderItemId: batch.id,
            },
            data: {
              remainingStock: {
                decrement: deductFromThisBatch,
              },
            },
          });

          const unitCost = this.resolveBatchUnitCost(batch);
          consumedBatches.push({
            purchaseOrderItemId: batch.id,
            quantity: deductFromThisBatch,
            unitCost,
            totalCost: unitCost * deductFromThisBatch,
          });

          remainingToDeduct -= deductFromThisBatch;
        }

        if (remainingToDeduct > 0) {
          throw new Error(`商品 ID ${item.shopProductId || item.productId} 库存不足，缺口: ${remainingToDeduct}`);
        }
      }

      // 4. 根据实际扣减完的批次，统一同步该商品及其关联的主库商品物理库存
      await this.syncStockFromBatches(tx, item.productId || null, item.shopProductId || null);

      const totalCost = consumedBatches.reduce((sum, batch) => sum + batch.totalCost, 0);
      const quantity = Math.max(0, Number(item.quantity || 0));
      snapshots.push({
        quantity,
        totalCost,
        averageUnitCost: quantity > 0 ? totalCost / quantity : 0,
        batches: consumedBatches,
      });
    }
    return snapshots;
  }

  /**
   * 将指定商品的物理库存 stock 字段同步为所有已确认采购批次(PurchaseOrderItem)的剩余数量之和。
   * @param tx Prisma 事务客户端
   * @param productId 主库商品 ID
   * @param shopProductId 店铺商品 ID
   */
  static async syncStockFromBatches(
    tx: Prisma.TransactionClient,
    productId: string | null,
    shopProductId: string | null
  ) {
    const targetShopProductIds = new Set<string>();
    const targetProductIds = new Set<string>();

    const rawShopProductId = String(shopProductId || "").trim();
    const rawProductId = String(productId || "").trim();

    if (rawShopProductId) {
      targetShopProductIds.add(rawShopProductId);
      const sp = await tx.shopProduct.findUnique({
        where: { id: rawShopProductId },
        select: { productId: true },
      });
      if (sp?.productId) {
        targetProductIds.add(sp.productId);
      }
    }

    if (rawProductId) {
      // 检查 rawProductId 是否实际上是 shopProduct 的 ID
      const asShopProduct = await tx.shopProduct.findUnique({
        where: { id: rawProductId },
        select: { id: true, productId: true },
      });

      if (asShopProduct) {
        targetShopProductIds.add(asShopProduct.id);
        if (asShopProduct.productId) {
          targetProductIds.add(asShopProduct.productId);
        }
      } else {
        targetProductIds.add(rawProductId);
      }

      // 如果有主库商品 ID，找出其下所有关联的店铺商品，确保全店物理库存保持最新
      const relatedShopProducts = await tx.shopProduct.findMany({
        where: { productId: rawProductId },
        select: { id: true },
      });
      for (const rsp of relatedShopProducts) {
        targetShopProductIds.add(rsp.id);
      }
    }

    // 1. 同步所有目标店铺商品的物理库存及保质期批次
    for (const spId of targetShopProductIds) {
      await this.syncShelfLifeBatchesFromPurchaseItems(tx, null, spId);

      const aggregateResult = await tx.purchaseOrderItem.aggregate({
        where: {
          OR: [
            { shopProductId: spId },
            { productId: spId },
          ],
          remainingQuantity: { gt: 0 },
          purchaseOrder: { status: "Received" },
        },
        _sum: {
          remainingQuantity: true,
        },
      });

      const sum = aggregateResult._sum.remainingQuantity || 0;

      await tx.shopProduct.update({
        where: { id: spId },
        data: { stock: sum },
      });
    }

    // 2. 同步所有目标主库商品的物理库存及保质期批次
    for (const pId of targetProductIds) {
      await this.syncShelfLifeBatchesFromPurchaseItems(tx, pId, null);

      const aggregateResult = await tx.purchaseOrderItem.aggregate({
        where: {
          productId: pId,
          remainingQuantity: { gt: 0 },
          purchaseOrder: { status: "Received" },
        },
        _sum: {
          remainingQuantity: true,
        },
      });

      const sum = aggregateResult._sum.remainingQuantity || 0;

      await tx.product.update({
        where: { id: pId },
        data: { stock: sum },
      });
    }
  }
}
