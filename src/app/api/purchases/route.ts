import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PurchaseOrderItem } from "@/lib/types";

// 获取所有采购订单
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  try {
    const purchases = await prisma.purchaseOrder.findMany({
      where: type ? { type } : {},
      include: {
        items: {
          include: {
            product: true,
            supplier: true
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

// 辅助函数：生成业务友好的单号 (PO-YYYYMMDD-XXXX)
function generateOrderId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `PO-${date}-${random}`;
}

// 创建新采购订单
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      status, 
      date, 
      totalAmount, 
      items, 
      shippingFees, 
      extraFees,
      trackingData,
      paymentVoucher,
      paymentVouchers
    } = body;

    const orderId = generateOrderId();

    const purchase = await prisma.purchaseOrder.create({
      data: {
        id: orderId,
        status: status || "Draft",
        date: date ? new Date(date) : new Date(),
        totalAmount: Number(totalAmount) || 0,
        shippingFees: Number(shippingFees) || 0,
        extraFees: Number(extraFees) || 0,
        paymentVoucher: paymentVoucher || null,
        paymentVouchers: paymentVouchers || [],
        trackingData: trackingData || [],
        items: {
          create: items.map((item: PurchaseOrderItem) => ({
            productId: item.productId,
            supplierId: item.supplierId,
            quantity: Number(item.quantity) || 0,
            costPrice: Number(item.costPrice) || 0
          }))
        }
      },
      include: {
        items: {
          include: {
            supplier: true
          }
        }
      }
    });

    return NextResponse.json(purchase);
  } catch (error) {
    console.error("Failed to create purchase order:", error);
    return NextResponse.json({ error: "Failed to create purchase order" }, { status: 500 });
  }
}
