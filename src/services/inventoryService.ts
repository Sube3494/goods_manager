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
    items: { productId?: string | null; shopProductId?: string | null; quantity: number }[]
  ) {
    for (const item of items) {
      let remainingToDeduct = item.quantity;

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

        remainingToDeduct -= deductFromThisBatch;
      }

      // 3. 校验库存是否足够 (虽然前端通常有校验，但后端逻辑必须闭环)
      if (remainingToDeduct > 0) {
        throw new Error(`商品 ID ${item.shopProductId || item.productId} 库存不足，缺口: ${remainingToDeduct}`);
      }

      // 4. 更新业务商品库存总量（优先店铺商品）
      if (item.shopProductId) {
        const shopProductResult = await tx.shopProduct.updateMany({
          where: {
            id: item.shopProductId,
            shop: { userId },
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

        if (shopProductResult.count === 0) {
          throw new Error(`并发冲突：店铺商品 ID ${item.shopProductId} 的库存发生变动导致不足。请重试。`);
        }

        // 4.1 同步扣减关联的主库全局商品库存（Product.stock）
        // 如果该店铺商品关联了主库商品（productId），则联动扣减主库总库存
        // 避免 ShopProduct.stock 扣减了但 Product.stock 没动，导致数据脱节
        const linkedProductId = item.productId;
        if (linkedProductId) {
          await tx.product.update({
            where: { id: linkedProductId },
            data: {
              stock: {
                decrement: item.quantity
              }
            }
          });
        } else {
          // 如果 item 中没有携带 productId，则从数据库中查询一次
          const shopProduct = await tx.shopProduct.findUnique({
            where: { id: item.shopProductId },
            select: { productId: true }
          });
          if (shopProduct?.productId) {
            await tx.product.update({
              where: { id: shopProduct.productId },
              data: {
                stock: {
                  decrement: item.quantity
                }
              }
            });
          }
        }
      } else {
        const productResult = await tx.product.updateMany({
          where: {
            id: item.productId!,
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
}
