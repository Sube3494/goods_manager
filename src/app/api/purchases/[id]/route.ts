import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PurchaseOrderItem } from "@/lib/types";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, items, supplierId, totalAmount, date } = body;

    // 更新采购订单
    const purchase = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        status,
        supplierId,
        totalAmount: totalAmount !== undefined ? Number(totalAmount) : undefined,
        date: date ? new Date(date) : undefined,
        // 如果提供了 items，通常需要处理复杂的同步（删除旧的，创建新的，或者更新现有的）
        // 这里简化处理：如果有 items，先删除所有旧的，再创建新的
        ...(items && {
          items: {
            deleteMany: {},
            create: items.map((item: PurchaseOrderItem) => ({
              productId: item.productId,
              quantity: Number(item.quantity) || 0,
              costPrice: Number(item.costPrice) || 0
            }))
          }
        })
      },
      include: {
        items: true
      }
    });

    // 如果状态变为 "Received"，自动增加商品库存
    if (status === "Received") {
      const orderItems = await prisma.purchaseOrderItem.findMany({
        where: { purchaseOrderId: id }
      });

      for (const item of orderItems) {
        await prisma.product.update({
          where: { id: item.productId },
          data: {
            stock: {
              increment: item.quantity
            }
          }
        });
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
