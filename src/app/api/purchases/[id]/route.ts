import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PurchaseOrderItem as PurchaseOrderItemType } from "@/lib/types";
import { FinanceMath } from "@/lib/math";

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


    // 使用事务确保更新和库存调整的原子性
    const purchase = await prisma.$transaction(async (tx) => {
      // 1. 更新采购订单
      const p = await tx.purchaseOrder.update({
        where: { id },
        data: {
          status,
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
                productId: item.productId,
                shopProductId: item.shopProductId || null,
                supplierId: item.supplierId,
                quantity: Number(item.quantity) || 0,
                remainingQuantity: status === "Received" ? (Number(item.quantity) || 0) : undefined,
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

      // 2. 如果状态变为 "Received"，自动增加商品库存并计算加权平均成本
      if (status === "Received") {
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
          } else {
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
      }
      return p;
    });

    return NextResponse.json(purchase);
  } catch (error) {
    console.error("Failed to update purchase order:", error);
    return NextResponse.json({ error: "Failed to update purchase order" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // 显式删除关联明细（由于 schema 有 onDelete: Cascade，此步通常是多余的，但保留作为保险）
    await prisma.purchaseOrderItem.deleteMany({
      where: { purchaseOrderId: id }
    });
    
    await prisma.purchaseOrder.delete({
      where: { id }
    });

    return NextResponse.json({ success: true, message: "Purchase order deleted successfully" });
  } catch (error) {
    console.error("Failed to delete purchase order:", error);
    return NextResponse.json(
      { error: "Failed to delete purchase order", details: error instanceof Error ? error.message : String(error) }, 
      { status: 500 }
    );
  }
}
