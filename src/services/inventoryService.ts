import { Prisma } from "../../prisma/generated-client";

/**
 * 库存核心服务
 */
export class InventoryService {
  private static buildInventoryScope(item: {
    productId?: string | null;
    productVariantId?: string | null;
    shopProductId?: string | null;
    shopProductVariantId?: string | null;
  }): Prisma.PurchaseOrderItemWhereInput | null {
    const variantIds = [item.shopProductVariantId, item.productVariantId].filter(Boolean) as string[];
    if (variantIds.length > 0) {
      return {
        OR: [
          { shopProductVariantId: { in: variantIds } },
          { productVariantId: { in: variantIds } },
        ],
      };
    }

    const productIds = [item.shopProductId, item.productId].filter(Boolean) as string[];
    if (productIds.length > 0) {
      return {
        productVariantId: null,
        shopProductVariantId: null,
        OR: [
          { shopProductId: { in: productIds } },
          { productId: { in: productIds } },
        ],
      };
    }

    return null;
  }

  private static async getOutboundItemLabel(
    tx: Prisma.TransactionClient,
    userId: string,
    item: {
      productId?: string | null;
      productVariantId?: string | null;
      shopProductId?: string | null;
      shopProductVariantId?: string | null;
    }
  ) {
    if (item.shopProductVariantId) {
      const shopVariant = await tx.shopProductVariant.findFirst({
        where: {
          id: item.shopProductVariantId,
          shopProduct: {
            shop: { userId },
          },
        },
        select: {
          variantName: true,
          optionSummary: true,
          sku: true,
          shopProduct: {
            select: {
              productName: true,
              product: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      const baseName = shopVariant?.shopProduct?.productName || shopVariant?.shopProduct?.product?.name;
      const variantLabel = shopVariant?.variantName || shopVariant?.optionSummary;
      const sku = shopVariant?.sku;
      return [baseName, variantLabel, sku ? `(${sku})` : ""].filter(Boolean).join(" ") || "该规格商品";
    }

    if (item.productVariantId) {
      const productVariant = await tx.productVariant.findUnique({
        where: { id: item.productVariantId },
        select: {
          variantName: true,
          optionSummary: true,
          sku: true,
          product: {
            select: {
              name: true,
            },
          },
        },
      });

      return [
        productVariant?.product?.name,
        productVariant?.variantName || productVariant?.optionSummary,
        productVariant?.sku ? `(${productVariant.sku})` : "",
      ].filter(Boolean).join(" ") || "该规格商品";
    }

    if (item.shopProductId) {
      const shopProduct = await tx.shopProduct.findFirst({
        where: {
          id: item.shopProductId,
          shop: { userId },
        },
        select: {
          productName: true,
          sku: true,
          product: {
            select: {
              name: true,
              sku: true,
            },
          },
        },
      });

      const name = shopProduct?.productName || shopProduct?.product?.name;
      const sku = shopProduct?.sku || shopProduct?.product?.sku;
      return [name, sku ? `(${sku})` : ""].filter(Boolean).join(" ") || "该商品";
    }

    if (item.productId) {
      const product = await tx.product.findUnique({
        where: { id: item.productId },
        select: {
          name: true,
          sku: true,
        },
      });

      return [product?.name, product?.sku ? `(${product.sku})` : ""].filter(Boolean).join(" ") || "该商品";
    }

    return "该商品";
  }

  /**
   * 处理出库的 FIFO (先进先出) 扣减逻辑
   * @param tx Prisma 事务客户端
   * @param userId 操作用户 ID
   * @param items 出库明细
   */
  static async processOutboundFIFO(
    tx: Prisma.TransactionClient,
    userId: string,
    items: {
      productId?: string | null;
      productVariantId?: string | null;
      shopProductId?: string | null;
      shopProductVariantId?: string | null;
      quantity: number;
    }[]
  ) {
    for (const item of items) {
      let remainingToDeduct = item.quantity;
      const inventoryScope = this.buildInventoryScope(item);

      if (!inventoryScope) {
        throw new Error("出库商品缺少关联标识，无法扣减库存");
      }

      // 1. 查找该商品所有可用的入库批次，按日期升序排列 (先进先出)
      // 增加 userId 校验以确保数据隔离安全性
      const batches = await tx.purchaseOrderItem.findMany({
        where: {
          ...inventoryScope,
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
          const itemLabel = await this.getOutboundItemLabel(tx, userId, item);
          throw new Error(`并发冲突：${itemLabel} 在该批次库存不足，请重试。`);
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
        const itemLabel = await this.getOutboundItemLabel(tx, userId, item);
        throw new Error(`${itemLabel} 库存不足，缺口 ${remainingToDeduct} 件`);
      }

      // 4. 根据实际扣减完的批次，统一同步该商品及其关联的主库商品物理库存
      await this.syncStockFromBatches(
        tx,
        item.productId || null,
        item.shopProductId || null,
        item.productVariantId || null,
        item.shopProductVariantId || null
      );
    }
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
    shopProductId: string | null,
    productVariantId: string | null = null,
    shopProductVariantId: string | null = null
  ) {
    if (shopProductVariantId) {
      const shopVariant = await tx.shopProductVariant.findUnique({
        where: { id: shopProductVariantId },
        select: { shopProductId: true, productVariantId: true }
      });
      const relatedVariantId = shopVariant?.productVariantId;
      const ids = [shopProductVariantId, relatedVariantId].filter(Boolean) as string[];

      const aggregateResult = await tx.purchaseOrderItem.aggregate({
        where: {
          OR: [
            { shopProductVariantId: { in: ids } },
            { productVariantId: { in: ids } }
          ],
          remainingQuantity: { gt: 0 },
          purchaseOrder: { status: "Received" }
        },
        _sum: {
          remainingQuantity: true
        }
      });
      const sum = aggregateResult._sum.remainingQuantity || 0;

      await tx.shopProductVariant.update({
        where: { id: shopProductVariantId },
        data: { stock: sum }
      });

      if (relatedVariantId) {
        await tx.productVariant.update({
          where: { id: relatedVariantId },
          data: { stock: sum }
        });
        const baseVariant = await tx.productVariant.findUnique({
          where: { id: relatedVariantId },
          select: { productId: true }
        });
        if (baseVariant?.productId) {
          await this.syncStockFromBatches(tx, baseVariant.productId, null, null, null);
        }
      }

      if (shopVariant?.shopProductId) {
        await this.syncStockFromBatches(tx, null, shopVariant.shopProductId, null, null);
      }
    } else if (productVariantId) {
      const shopVariants = await tx.shopProductVariant.findMany({
        where: { productVariantId },
        select: { id: true, shopProductId: true }
      });
      const ids = [productVariantId, ...shopVariants.map((sv) => sv.id)];

      const aggregateResult = await tx.purchaseOrderItem.aggregate({
        where: {
          OR: [
            { productVariantId: { in: ids } },
            { shopProductVariantId: { in: ids } }
          ],
          remainingQuantity: { gt: 0 },
          purchaseOrder: { status: "Received" }
        },
        _sum: {
          remainingQuantity: true
        }
      });
      const sum = aggregateResult._sum.remainingQuantity || 0;

      await tx.productVariant.update({
        where: { id: productVariantId },
        data: { stock: sum }
      });

      for (const sv of shopVariants) {
        await tx.shopProductVariant.update({
          where: { id: sv.id },
          data: { stock: sum }
        });
        if (sv.shopProductId) {
          await this.syncStockFromBatches(tx, null, sv.shopProductId, null, null);
        }
      }

      const variant = await tx.productVariant.findUnique({
        where: { id: productVariantId },
        select: { productId: true }
      });

      if (variant?.productId) {
        await this.syncStockFromBatches(tx, variant.productId, null, null, null);
      }
    } else if (shopProductId) {
      const sp = await tx.shopProduct.findUnique({
        where: { id: shopProductId },
        select: { productId: true, hasVariants: true }
      });

      if (sp?.hasVariants) {
        const variantSum = await tx.shopProductVariant.aggregate({
          where: { shopProductId, isActive: true },
          _sum: { stock: true }
        });
        const totalStock = variantSum._sum.stock || 0;
        await tx.shopProduct.update({
          where: { id: shopProductId },
          data: { stock: totalStock }
        });
      } else {
        const ids = [shopProductId, sp?.productId].filter(Boolean) as string[];
        const aggregateResult = await tx.purchaseOrderItem.aggregate({
          where: {
            productVariantId: null,
            shopProductVariantId: null,
            OR: [
              { shopProductId: { in: ids } },
              { productId: { in: ids } }
            ],
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
      }

      if (sp?.productId) {
        await this.syncStockFromBatches(tx, sp.productId, null, null, null);
      }
    } else if (productId) {
      const prod = await tx.product.findUnique({
        where: { id: productId },
        select: { hasVariants: true }
      });

      if (prod?.hasVariants) {
        const variantSum = await tx.productVariant.aggregate({
          where: { productId, isActive: true },
          _sum: { stock: true }
        });
        const totalStock = variantSum._sum.stock || 0;
        await tx.product.update({
          where: { id: productId },
          data: { stock: totalStock }
        });
      } else {
        const shopProds = await tx.shopProduct.findMany({
          where: { productId },
          select: { id: true }
        });
        const ids = [productId, ...shopProds.map((item) => item.id)];

        const aggregateResult = await tx.purchaseOrderItem.aggregate({
          where: {
            productVariantId: null,
            shopProductVariantId: null,
            OR: [
              { productId: { in: ids } },
              { shopProductId: { in: ids } }
            ],
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

        for (const sp of shopProds) {
          await tx.shopProduct.update({
            where: { id: sp.id },
            data: { stock: sum }
          });
        }
      }
    }
  }
}
