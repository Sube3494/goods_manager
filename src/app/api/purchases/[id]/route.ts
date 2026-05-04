import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PurchaseOrderItem as PurchaseOrderItemType } from "@/lib/types";
import { FinanceMath } from "@/lib/math";

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
      shopName
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

      const previousStatus = existingPurchase.status;
      const nextStatus = typeof status === "string" && status.trim() ? status : previousStatus;
      const isReceivingNow = previousStatus !== "Received" && nextStatus === "Received";
      const isRevokingReceived = previousStatus === "Received" && nextStatus !== "Received";

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

      const p = await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: nextStatus,
          totalAmount: totalAmount !== undefined ? FinanceMath.add(Number(totalAmount), 0) : undefined,
          shippingFees: shippingFees !== undefined ? FinanceMath.add(Number(shippingFees), 0) : undefined,
          extraFees: extraFees !== undefined ? FinanceMath.add(Number(extraFees), 0) : undefined,
          discountAmount: discountAmount !== undefined ? FinanceMath.add(Number(discountAmount), 0) : undefined,

          paymentVouchers: paymentVouchers !== undefined ? paymentVouchers : undefined,
          trackingData: trackingData !== undefined ? trackingData : undefined,
          shippingAddress: shippingAddress !== undefined ? shippingAddress : undefined,
          shopName: shopName !== undefined ? shopName : undefined,
          date: date ? new Date(date) : undefined,
          ...(items && {
            items: {
              deleteMany: {},
              create: items.map((item: PurchaseOrderItemType) => ({
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
              supplier: true
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
              const currentStock = shopProduct.stock;
              const currentCost = shopProduct.costPrice || 0;
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

              await tx.shopProduct.update({
                where: { id: item.shopProductId },
                data: {
                  stock: { increment: incomingQty },
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
                  stock: { increment: incomingQty },
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
                  stock: { decrement: revertQty },
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
                  stock: { decrement: revertQty },
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
                stock: { decrement: originalQuantity },
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
                stock: { decrement: originalQuantity },
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
