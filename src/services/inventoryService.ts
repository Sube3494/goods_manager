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

/**
 * 库存核心服务
 */
export class InventoryService {
  /**
   * 处理出库的 FIFO (先进先出) 扣减逻辑
   * @param tx Prisma 事务客户端
   * @param userId 操作用户 ID
   * @param items 出库明细
   */
  static async processOutboundFIFO(
    tx: Prisma.TransactionClient,
    userId: string,
    items: { productId?: string | null; shopProductId?: string | null; quantity: number }[]
  ): Promise<OutboundFifoItemSnapshot[]> {
    const snapshots: OutboundFifoItemSnapshot[] = [];
    for (const item of items) {
      let remainingToDeduct = item.quantity;
      const consumedBatches: OutboundFifoItemSnapshot["batches"] = [];

      if (!item.shopProductId && !item.productId) {
        throw new Error("出库商品缺少关联标识，无法扣减库存");
      }

      // 1. 查找该商品所有可用的入库批次，按日期升序排列 (先进先出)
      // 增加 userId 校验以确保数据隔离安全性
      const batches = await tx.purchaseOrderItem.findMany({
        where: {
          ...(item.shopProductId ? { shopProductId: item.shopProductId } : { productId: item.productId! }),
          remainingQuantity: {
            gt: 0
          },
          purchaseOrder: {
            userId: userId,
            status: "Received"
          }
        },
        orderBy: {
          purchaseOrder: {
            date: 'asc'
          }
        }
      });

      for (const batch of batches) {
        if (remainingToDeduct <= 0) break;

        const batchRemaining = batch.remainingQuantity || 0;
        const deductFromThisBatch = Math.min(batchRemaining, remainingToDeduct);

        // 2. 更新批次剩余数量（带防超卖并发校验）
        const updateResult = await tx.purchaseOrderItem.updateMany({
          where: { 
            id: batch.id,
            remainingQuantity: {
              gte: deductFromThisBatch // 确保库存依然足够
            }
          },
          data: {
            remainingQuantity: {
              decrement: deductFromThisBatch
            }
          }
        });

        if (updateResult.count === 0) {
          throw new Error(`并发冲突：商品 ID ${item.shopProductId || item.productId} 在该批次库存不足。请重试。`);
        }

        // 同时更新关联的保质期批次库存 ProductBatch（如果有的话）
        await tx.productBatch.updateMany({
          where: {
            purchaseOrderItemId: batch.id
          },
          data: {
            remainingStock: {
              decrement: deductFromThisBatch
            }
          }
        });

        const unitCost = Number(batch.costPrice || 0);
        consumedBatches.push({
          purchaseOrderItemId: batch.id,
          quantity: deductFromThisBatch,
          unitCost,
          totalCost: unitCost * deductFromThisBatch,
        });

        remainingToDeduct -= deductFromThisBatch;
      }

      // 3. 校验库存是否足够 (虽然前端通常有校验，但后端逻辑必须闭环)
      if (remainingToDeduct > 0) {
        throw new Error(`商品 ID ${item.shopProductId || item.productId} 库存不足，缺口: ${remainingToDeduct}`);
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
    if (shopProductId) {
      // 聚合所有有效的店铺采购批次
      const aggregateResult = await tx.purchaseOrderItem.aggregate({
        where: {
          shopProductId,
          remainingQuantity: { gt: 0 },
          purchaseOrder: { status: "Received" }
        },
        _sum: {
          remainingQuantity: true
        }
      });
      const sum = aggregateResult._sum.remainingQuantity || 0;

      await tx.shopProduct.update({
        where: { id: shopProductId },
        data: { stock: sum }
      });

      // 联动同步主库商品
      const sp = await tx.shopProduct.findUnique({
        where: { id: shopProductId },
        select: { productId: true }
      });
      if (sp?.productId) {
        await this.syncStockFromBatches(tx, sp.productId, null);
      }
    } else if (productId) {
      // 聚合所有有效的全局采购批次（包括所有店铺的）
      const aggregateResult = await tx.purchaseOrderItem.aggregate({
        where: {
          productId,
          remainingQuantity: { gt: 0 },
          purchaseOrder: { status: "Received" }
        },
        _sum: {
          remainingQuantity: true
        }
      });
      const sum = aggregateResult._sum.remainingQuantity || 0;

      await tx.product.update({
        where: { id: productId },
        data: { stock: sum }
      });
    }
  }
}
