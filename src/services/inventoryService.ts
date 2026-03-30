import { Prisma } from "../../prisma/generated-client";

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
    items: { productId: string; quantity: number }[]
  ) {
    for (const item of items) {
      let remainingToDeduct = item.quantity;

      // 1. 查找该商品所有可用的入库批次，按日期升序排列 (先进先出)
      // 增加 userId 校验以确保数据隔离安全性
      const batches = await tx.purchaseOrderItem.findMany({
        where: {
          productId: item.productId,
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
          throw new Error(`并发冲突：商品 ID ${item.productId} 在该批次库存不足。请重试。`);
        }

        remainingToDeduct -= deductFromThisBatch;
      }

      // 3. 校验库存是否足够 (虽然前端通常有校验，但后端逻辑必须闭环)
      if (remainingToDeduct > 0) {
        throw new Error(`商品 ID ${item.productId} 库存不足，缺口: ${remainingToDeduct}`);
      }

      // 4. 更新商品全局库存总量（带防超卖并发校验）
      const productResult = await tx.product.updateMany({
        where: { 
          id: item.productId,
          stock: {
            gte: item.quantity
          }
        },
        data: {
          stock: {
            decrement: item.quantity
          }
        }
      });

      if (productResult.count === 0) {
        throw new Error(`并发冲突：商品 ID ${item.productId} 的总库存发生变动导致不足。请重试。`);
      }
    }
  }
}
