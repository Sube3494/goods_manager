import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PurchaseOrderItem as PurchaseOrderItemType } from "@/lib/types";
import { FinanceMath } from "@/lib/math";
import { sanitizePurchaseOrderItems } from "@/lib/purchaseOrderItems";
import { InventoryService } from "@/services/inventoryService";
import { Prisma } from "../../../../../prisma/generated-client";
import { allocateShippingToPurchaseItems, calculatePurchaseOrderTotalAmount } from "@/lib/purchaseCosting";
import { parseAsShanghaiTime } from "@/lib/dateUtils";

function calculateRevertedCostPrice(currentStock: number, currentCost: number, revertQty: number, revertCost: number) {
  const nextStock = currentStock - revertQty;
  if (nextStock <= 0) {
    return 0;
  }

  const currentTotalValue = FinanceMath.multiply(currentStock, currentCost || 0);
  const revertTotalValue = FinanceMath.multiply(revertQty, revertCost || 0);
  const nextTotalValue = FinanceMath.add(currentTotalValue, -revertTotalValue);

  return Math.max(0, FinanceMath.divide(nextTotalValue, nextStock));
}

type ParsedOutboundSnapshotBatch = {
  purchaseOrderItemId: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
};

type ParsedOutboundSnapshot = {
  quantity: number;
  totalCost: number;
  averageUnitCost: number;
  batches: ParsedOutboundSnapshotBatch[];
};

function parseOutboundCostSnapshot(value: unknown): ParsedOutboundSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const batches = Array.isArray(raw.batches)
    ? raw.batches
        .map((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return null;
          }
          const batch = entry as Record<string, unknown>;
          const purchaseOrderItemId = String(batch.purchaseOrderItemId || "").trim();
          const quantity = Number(batch.quantity || 0);
          if (!purchaseOrderItemId || !Number.isFinite(quantity) || quantity <= 0) {
            return null;
          }
          const unitCost = Number(batch.unitCost || 0);
          const totalCost = Number(batch.totalCost || 0);
          return {
            purchaseOrderItemId,
            quantity,
            unitCost: Number.isFinite(unitCost) ? unitCost : 0,
            totalCost: Number.isFinite(totalCost) ? totalCost : 0,
          };
        })
        .filter((entry): entry is ParsedOutboundSnapshotBatch => Boolean(entry))
    : [];
  const quantity = Number(raw.quantity || 0);
  const totalCost = Number(raw.totalCost || 0);
  const averageUnitCost = Number(raw.averageUnitCost || 0);
  return {
    quantity: Number.isFinite(quantity) ? quantity : 0,
    totalCost: Number.isFinite(totalCost) ? totalCost : 0,
    averageUnitCost: Number.isFinite(averageUnitCost) ? averageUnitCost : 0,
    batches,
  };
}

function rebuildOutboundCostSnapshot(
  snapshot: ParsedOutboundSnapshot,
  costPriceByPurchaseOrderItemId: Map<string, number>
) {
  let changed = false;
  const nextBatches = snapshot.batches.map((batch) => {
    const nextUnitCost = costPriceByPurchaseOrderItemId.get(batch.purchaseOrderItemId);
    if (nextUnitCost === undefined) {
      return batch;
    }
    changed = true;
    return {
      ...batch,
      unitCost: nextUnitCost,
      totalCost: FinanceMath.multiply(nextUnitCost, batch.quantity),
    };
  });
  if (!changed) {
    return null;
  }
  const nextTotalCost = nextBatches.reduce(
    (sum, batch) => FinanceMath.add(sum, batch.totalCost),
    0
  );
  return {
    quantity: snapshot.quantity,
    totalCost: nextTotalCost,
    averageUnitCost: snapshot.quantity > 0 ? FinanceMath.divide(nextTotalCost, snapshot.quantity) : 0,
    batches: nextBatches,
  };
}

async function syncOutboundCostSnapshotsForPurchaseItems(
  tx: Prisma.TransactionClient,
  purchaseOrderUserId: string | null | undefined,
  costPriceByPurchaseOrderItemId: Map<string, number>
) {
  if (costPriceByPurchaseOrderItemId.size <= 0) {
    return;
  }
  const outboundItems = await tx.outboundOrderItem.findMany({
    where: purchaseOrderUserId
      ? {
          outboundOrder: {
            userId: purchaseOrderUserId,
          },
        }
      : undefined,
    select: {
      id: true,
      costSnapshot: true,
    },
  });
  for (const outboundItem of outboundItems) {
    const snapshot = parseOutboundCostSnapshot(outboundItem.costSnapshot);
    if (!snapshot || snapshot.batches.length <= 0) {
      continue;
    }
    const nextSnapshot = rebuildOutboundCostSnapshot(snapshot, costPriceByPurchaseOrderItemId);
    if (!nextSnapshot) {
      continue;
    }
    await tx.outboundOrderItem.update({
      where: { id: outboundItem.id },
      data: {
        costSnapshot: nextSnapshot as Prisma.InputJsonValue,
      },
    });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { 
      status, 
      items, 
      totalAmount,
      shippingFees,
      extraFees,
      discountAmount,
      trackingData,
      paymentVouchers,
      date,
      shippingAddress,
      shopName,
      costBackfill,
      costBackfillItemId,
    } = body;

    const purchase = await prisma.$transaction(async (tx) => {
      const existingPurchase = await tx.purchaseOrder.findUnique({
        where: { id },
        include: {
          items: true,
        },
      });

      if (!existingPurchase) {
        throw new Error("采购单不存在");
      }

      const previousStatus = existingPurchase.status === "Draft" ? "Confirmed" : existingPurchase.status;
      const nextStatus = typeof status === "string" && status.trim()
        ? (status === "Draft" ? "Confirmed" : status)
        : previousStatus;
      const isReceivingNow = previousStatus !== "Received" && nextStatus === "Received";
      const isRevokingReceived = previousStatus === "Received" && nextStatus !== "Received";
      const isReceivedCostBackfill = previousStatus === "Received" && costBackfill === true;

      if (isReceivedCostBackfill) {
        if (!Array.isArray(items) || items.length <= 0) {
          throw new Error("缺少待补录的入库批次成本数据");
        }
        if (nextStatus !== "Received") {
          throw new Error("已入库批次补录成本时不能修改单据状态");
        }
        const existingItemsById = new Map(existingPurchase.items.map((item) => [item.id, item] as const));
        const costPriceByPurchaseOrderItemId = new Map<string, number>();
        const normalizedShippingFees = shippingFees !== undefined
          ? FinanceMath.add(Number(shippingFees) || 0, 0)
          : Number(existingPurchase.shippingFees || 0);
        const normalizedExtraFees = extraFees !== undefined
          ? FinanceMath.add(Number(extraFees) || 0, 0)
          : Number(existingPurchase.extraFees || 0);
        const normalizedDiscountAmount = discountAmount !== undefined
          ? FinanceMath.add(Number(discountAmount) || 0, 0)
          : Number(existingPurchase.discountAmount || 0);
        const validatedItems: PurchaseOrderItemType[] = [];

        for (const rawItem of items as PurchaseOrderItemType[]) {
          const itemId = String(rawItem.id || "").trim();
          const existingItem = itemId ? existingItemsById.get(itemId) : null;
          if (!existingItem) {
            throw new Error("已入库批次补录成本时不能新增或替换商品明细");
          }
          const nextQuantity = Number(rawItem.quantity || 0);
          if (nextQuantity !== Number(existingItem.quantity || 0)) {
            throw new Error("已入库批次补录成本时不能修改数量");
          }
          if ((rawItem.productId || null) !== (existingItem.productId || null)
            || (rawItem.shopProductId || null) !== (existingItem.shopProductId || null)) {
            throw new Error("已入库批次补录成本时不能修改关联商品");
          }
          validatedItems.push({
            ...rawItem,
            id: existingItem.id,
            quantity: nextQuantity,
            costPrice: FinanceMath.add(Number(rawItem.costPrice) || 0, 0),
          });
        }

        const allocatedItems = allocateShippingToPurchaseItems(
          validatedItems,
          normalizedShippingFees,
          normalizedExtraFees
        );
        for (const item of allocatedItems) {
          if (item.id) {
            costPriceByPurchaseOrderItemId.set(item.id, FinanceMath.add(Number(item.costPrice) || 0, 0));
          }
        }
        if (existingItemsById.size !== costPriceByPurchaseOrderItemId.size) {
          throw new Error("已入库批次补录成本时需要保留完整的原始明细");
        }

        for (const existingItem of existingPurchase.items) {
          const nextCostPrice = costPriceByPurchaseOrderItemId.get(existingItem.id);
          if (nextCostPrice === undefined || nextCostPrice === Number(existingItem.costPrice || 0)) {
            continue;
          }
          await tx.purchaseOrderItem.update({
            where: { id: existingItem.id },
            data: {
              costPrice: nextCostPrice,
            },
          });
        }

        await tx.purchaseOrder.update({
          where: { id },
          data: {
            shippingFees: shippingFees !== undefined ? normalizedShippingFees : undefined,
            extraFees: extraFees !== undefined ? normalizedExtraFees : undefined,
            discountAmount: discountAmount !== undefined ? normalizedDiscountAmount : undefined,
            totalAmount: calculatePurchaseOrderTotalAmount({
              items: validatedItems,
              shippingFees: normalizedShippingFees,
              extraFees: normalizedExtraFees,
              discountAmount: normalizedDiscountAmount,
            }),
          },
        });

        await syncOutboundCostSnapshotsForPurchaseItems(
          tx,
          existingPurchase.userId,
          costPriceByPurchaseOrderItemId
        );

        const refreshedPurchase = await tx.purchaseOrder.findUnique({
          where: { id },
          include: {
            items: {
              include: {
                product: true,
                shopProduct: true,
                supplier: true,
                batches: true,
              },
            },
          },
        });

        if (!refreshedPurchase) {
          throw new Error("采购单不存在");
        }

        if (costBackfillItemId) {
          const requestedItemId = String(costBackfillItemId).trim();
          if (requestedItemId && !refreshedPurchase.items.some((item) => item.id === requestedItemId)) {
            throw new Error("目标批次不属于当前采购单");
          }
        }

        return refreshedPurchase;
      }

      if (isRevokingReceived) {
        for (const item of existingPurchase.items) {
          const currentRemaining = Number(item.remainingQuantity ?? 0);
          const originalQuantity = Number(item.quantity || 0);

          if (currentRemaining < originalQuantity) {
            throw new Error("该采购单已有商品被后续出库或占用，暂时不能撤销入库");
          }

          if (item.shopProductId) {
            const shopProduct = await tx.shopProduct.findUnique({
              where: { id: item.shopProductId },
            });

            if (!shopProduct || Number(shopProduct.stock || 0) < originalQuantity) {
              throw new Error("店铺商品当前库存不足，无法撤销这张已入库采购单");
            }
          } else if (item.productId) {
            const product = await tx.product.findUnique({
              where: { id: item.productId },
            });

            if (!product || Number(product.stock || 0) < originalQuantity) {
              throw new Error("主商品当前库存不足，无法撤销这张已入库采购单");
            }
          }
        }
      }

      const sanitizedItems = items
        ? await sanitizePurchaseOrderItems(tx, Array.isArray(items) ? items : [])
        : null;
      const normalizedShippingFees = shippingFees !== undefined
        ? FinanceMath.add(Number(shippingFees) || 0, 0)
        : Number(existingPurchase.shippingFees || 0);
      const normalizedExtraFees = extraFees !== undefined
        ? FinanceMath.add(Number(extraFees) || 0, 0)
        : Number(existingPurchase.extraFees || 0);
      const normalizedDiscountAmount = discountAmount !== undefined
        ? FinanceMath.add(Number(discountAmount) || 0, 0)
        : Number(existingPurchase.discountAmount || 0);
      const allocatedItems = sanitizedItems
        ? allocateShippingToPurchaseItems(
            sanitizedItems,
            normalizedShippingFees,
            normalizedExtraFees
          )
        : null;
      const normalizedTotalAmount = sanitizedItems
        ? calculatePurchaseOrderTotalAmount({
            items: sanitizedItems,
            shippingFees: normalizedShippingFees,
            extraFees: normalizedExtraFees,
            discountAmount: normalizedDiscountAmount,
          })
        : undefined;

      const p = await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: nextStatus,
          totalAmount: normalizedTotalAmount,
          shippingFees: shippingFees !== undefined ? normalizedShippingFees : undefined,
          extraFees: extraFees !== undefined ? normalizedExtraFees : undefined,
          discountAmount: discountAmount !== undefined ? normalizedDiscountAmount : undefined,

          paymentVouchers: paymentVouchers !== undefined ? paymentVouchers : undefined,
          trackingData: trackingData !== undefined ? trackingData : undefined,
          shippingAddress: shippingAddress !== undefined ? shippingAddress : undefined,
          shopName: shopName !== undefined ? shopName : undefined,
          date: date ? parseAsShanghaiTime(date) : undefined,
          ...(sanitizedItems && {
            items: {
              deleteMany: {},
              create: (allocatedItems || []).map((item: PurchaseOrderItemType) => ({
                productId: item.productId || null,
                shopProductId: item.shopProductId || null,
                supplierId: item.supplierId,
                quantity: Number(item.quantity) || 0,
                remainingQuantity: nextStatus === "Received" ? (Number(item.quantity) || 0) : undefined,
                costPrice: FinanceMath.add(Number(item.costPrice) || 0, 0)
              }))
            }
          })
        },
        include: {
          items: {
            include: {
              product: true,
              shopProduct: true,
              supplier: true,
              batches: true
            }
          }
        } as any // eslint-disable-line @typescript-eslint/no-explicit-any
      });

      if (isReceivingNow) {
        const orderItems = await tx.purchaseOrderItem.findMany({
          where: { purchaseOrderId: id }
        });

        for (const item of orderItems) {
          const incomingQty = item.quantity;
          const incomingCost = item.costPrice || 0;

          if (item.shopProductId) {
            const shopProduct = await tx.shopProduct.findUnique({
              where: { id: item.shopProductId }
            });

            if (shopProduct) {
              const currentCost = shopProduct.costPrice || 0;
              const newCostPrice = incomingCost > 0 ? incomingCost : currentCost;

              await tx.shopProduct.update({
                where: { id: item.shopProductId },
                data: {
                  costPrice: newCostPrice
                }
              });
            }
          } else if (item.productId) {
            const product = await tx.product.findUnique({
              where: { id: item.productId }
            });

            if (product) {
              const currentStock = product.stock;
              const currentCost = product.costPrice || 0;
              let newCostPrice = currentCost;

              if (incomingCost > 0) {
                if (currentStock <= 0) {
                  newCostPrice = incomingCost;
                } else {
                  const currentTotalValue = FinanceMath.multiply(currentStock, currentCost);
                  const incomingTotalValue = FinanceMath.multiply(incomingQty, incomingCost);
                  const totalValue = FinanceMath.add(currentTotalValue, incomingTotalValue);
                  const totalQty = currentStock + incomingQty;
                  newCostPrice = FinanceMath.divide(totalValue, totalQty);
                }
              }

              await tx.product.update({
                where: { id: item.productId },
                data: {
                  costPrice: newCostPrice
                }
              });
            }
          }

          // FIFO 支持：如果该项还没有设置余量
          if (item.remainingQuantity === null) {
            await tx.purchaseOrderItem.update({
              where: { id: item.id },
              data: { remainingQuantity: incomingQty }
            });
          }

          // 原子同步物理库存
          await InventoryService.syncStockFromBatches(tx, item.productId || null, item.shopProductId);
        }
      } else if (isRevokingReceived) {
        for (const item of existingPurchase.items) {
          const revertQty = Number(item.quantity || 0);
          const revertCost = Number(item.costPrice || 0);

          if (item.shopProductId) {
            const shopProduct = await tx.shopProduct.findUnique({
              where: { id: item.shopProductId }
            });

            if (shopProduct) {
              await tx.shopProduct.update({
                where: { id: item.shopProductId },
                data: {
                  costPrice: calculateRevertedCostPrice(
                    Number(shopProduct.stock || 0),
                    Number(shopProduct.costPrice || 0),
                    revertQty,
                    revertCost
                  ),
                }
              });
            }
          } else if (item.productId) {
            const product = await tx.product.findUnique({
              where: { id: item.productId }
            });

            if (product) {
              await tx.product.update({
                where: { id: item.productId },
                data: {
                  costPrice: calculateRevertedCostPrice(
                    Number(product.stock || 0),
                    Number(product.costPrice || 0),
                    revertQty,
                    revertCost
                  ),
                }
              });
            }
          }
        }

        await tx.purchaseOrderItem.updateMany({
          where: { purchaseOrderId: id },
          data: { remainingQuantity: null },
        });

        // 撤销入库后，同步物理库存
        for (const item of existingPurchase.items) {
          await InventoryService.syncStockFromBatches(tx, item.productId || null, item.shopProductId);
        }
      }
      return p;
    });

    return NextResponse.json(purchase);
  } catch (error) {
    console.error("Failed to update purchase order:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update purchase order" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await prisma.$transaction(async (tx) => {
      const existingPurchase = await tx.purchaseOrder.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!existingPurchase) {
        throw new Error("采购单不存在");
      }

      if (existingPurchase.status === "Received") {
        for (const item of existingPurchase.items) {
          const currentRemaining = Number(item.remainingQuantity ?? 0);
          const originalQuantity = Number(item.quantity || 0);

          if (currentRemaining < originalQuantity) {
            throw new Error("该采购单已有商品被后续出库或占用，暂时不能删除");
          }

          if (item.shopProductId) {
            const shopProduct = await tx.shopProduct.findUnique({
              where: { id: item.shopProductId },
            });

            if (!shopProduct || Number(shopProduct.stock || 0) < originalQuantity) {
              throw new Error("店铺商品当前库存不足，无法删除这张已入库采购单");
            }

            await tx.shopProduct.update({
              where: { id: item.shopProductId },
              data: {
                costPrice: calculateRevertedCostPrice(
                  Number(shopProduct.stock || 0),
                  Number(shopProduct.costPrice || 0),
                  originalQuantity,
                  Number(item.costPrice || 0)
                ),
              },
            });
          } else if (item.productId) {
            const product = await tx.product.findUnique({
              where: { id: item.productId },
            });

            if (!product || Number(product.stock || 0) < originalQuantity) {
              throw new Error("主商品当前库存不足，无法删除这张已入库采购单");
            }

            await tx.product.update({
              where: { id: item.productId },
              data: {
                costPrice: calculateRevertedCostPrice(
                  Number(product.stock || 0),
                  Number(product.costPrice || 0),
                  originalQuantity,
                  Number(item.costPrice || 0)
                ),
              },
            });
          }
        }
      }

      await tx.purchaseOrderItem.deleteMany({
        where: { purchaseOrderId: id }
      });

      await tx.purchaseOrder.delete({
        where: { id }
      });

      // 物理删除后，同步物理库存
      for (const item of existingPurchase.items) {
        await InventoryService.syncStockFromBatches(tx, item.productId || null, item.shopProductId);
      }
    });

    return NextResponse.json({ success: true, message: "Purchase order deleted successfully" });
  } catch (error) {
    console.error("Failed to delete purchase order:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete purchase order", details: error instanceof Error ? error.message : String(error) }, 
      { status: 500 }
    );
  }
}
