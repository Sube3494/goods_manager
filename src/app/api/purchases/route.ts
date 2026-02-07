import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PurchaseOrderItem } from "@/lib/types";

// 获取所有采购订单
export async function GET() {
  try {
    const purchases = await prisma.purchaseOrder.findMany({
      include: {
        supplier: true,
        items: {
          include: {
            product: true
          }
        }
      },
      orderBy: {
        date: 'desc'
      }
    });
    return NextResponse.json(purchases);
  } catch (error) {
    console.error("Failed to fetch purchases:", error);
    return NextResponse.json({ error: "Failed to fetch purchases" }, { status: 500 });
  }
}

// 创建新采购订单
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { supplierId, status, date, totalAmount, items } = body;

    const purchase = await prisma.purchaseOrder.create({
      data: {
        supplierId,
        status: status || "Draft",
        date: date ? new Date(date) : new Date(),
        totalAmount: Number(totalAmount) || 0,
        items: {
          create: items.map((item: PurchaseOrderItem) => ({
            productId: item.productId,
            quantity: Number(item.quantity) || 0,
            costPrice: Number(item.costPrice) || 0
          }))
        }
      },
      include: {
        items: true
      }
    });

    return NextResponse.json(purchase);
  } catch (error) {
    console.error("Failed to create purchase order:", error);
    return NextResponse.json({ error: "Failed to create purchase order" }, { status: 500 });
  }
}
