import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PurchaseOrderItem as PurchaseOrderItemType } from "@/lib/types";

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
      trackingData,
      paymentVoucher,
      paymentVouchers,
      date
    } = body;

    // 更新采购订单
    const purchase = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        status,
        totalAmount: totalAmount !== undefined ? Number(totalAmount) : undefined,
        shippingFees: shippingFees !== undefined ? Number(shippingFees) : undefined,
        extraFees: extraFees !== undefined ? Number(extraFees) : undefined,
        paymentVoucher: paymentVoucher !== undefined ? paymentVoucher : undefined,
        paymentVouchers: paymentVouchers !== undefined ? paymentVouchers : undefined,
        trackingData: trackingData !== undefined ? trackingData : undefined,
        date: date ? new Date(date) : undefined,
        // 如果提供了 items，先删除所有旧的，再创建新的
        ...(items && {
          items: {
            deleteMany: {},
            create: items.map((item: PurchaseOrderItemType) => ({
              productId: item.productId,
              supplierId: item.supplierId,
              quantity: Number(item.quantity) || 0,
              remainingQuantity: status === "Received" ? (Number(item.quantity) || 0) : undefined,
              costPrice: Number(item.costPrice) || 0
            }))
          }
        })
      },
      include: {
        items: {
          include: {
            product: true,
            supplier: true
          }
        }
      } as any // eslint-disable-line @typescript-eslint/no-explicit-any
    });

    // 如果状态变为 "Received"，自动增加商品库存
    // 注意：在更严谨的系统中，这里应该检查“前置状态”以防重复入库，但当前通过状态字匹配实现
    if (status === "Received") {
      const orderItems = await prisma.purchaseOrderItem.findMany({
        where: { purchaseOrderId: id }
      });

      for (const item of orderItems) {
        // Calculate new Weighted Average Cost
        const product = await prisma.product.findUnique({
          where: { id: item.productId }
        });

        if (product) {
          const currentStock = product.stock;
          const currentCost = product.costPrice || 0;
          const incomingQty = item.quantity;
          const incomingCost = item.costPrice || 0;

          let newCostPrice = currentCost;

          if (incomingCost > 0) {
              if (currentStock <= 0) {
                  newCostPrice = incomingCost;
              } else {
                  const totalValue = (currentStock * currentCost) + (incomingQty * incomingCost);
                  const totalQty = currentStock + incomingQty;
                  newCostPrice = totalValue / totalQty;
              }
          }

          await prisma.product.update({
            where: { id: item.productId },
            data: {
              stock: { increment: incomingQty },
              costPrice: newCostPrice
            }
          });

          // FIFO 支持：如果该项还没有设置余量，将其设置为入库量
          if (item.remainingQuantity === null) {
            await prisma.purchaseOrderItem.update({
              where: { id: item.id },
              data: { remainingQuantity: incomingQty }
            });
          }
        }
      }
    }



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
    // 首先删除关联的细项（虽然 Prisma schema 可能设置了级联删除，但显式删除更稳妥）
    await prisma.purchaseOrderItem.deleteMany({
      where: { purchaseOrderId: id }
    });
    
    await prisma.purchaseOrder.delete({
      where: { id }
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete purchase order" }, { status: 500 });
  }
}
