import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PurchaseOrderItem } from "@/lib/types";
import { Prisma } from "../../../../prisma/generated-client";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";

// 获取所有采购订单
export async function GET(request: Request) {
  const session = await getFreshSession() as SessionUser | null;
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const productId = searchParams.get("productId");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 权限检查
  const permission = type === "Inbound" ? "inbound:read" : "purchase:read";
  if (!hasPermission(session, permission)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const where: Prisma.PurchaseOrderWhereInput = {};
    if (type === "Inbound") {
        where.OR = [
            { type: "Inbound" },
            { status: "Received" }
        ];
    } else if (type) {
        where.type = type;
    }
    if (productId) {
      where.items = {
        some: {
          productId: productId
        }
      };
    }

    const purchases = await prisma.purchaseOrder.findMany({
      where: {
        ...where,
        // Optional: constrain by workspace check if needed, though permission might be enough if we trust workspaceId
        workspaceId: session.workspaceId
      },
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
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { 
      type,
      status, 
      date, 
      totalAmount, 
      items, 
      shippingFees, 
      extraFees,
      trackingData,
      paymentVouchers
    } = body;

    // 权限检查
    const permission = type === "Inbound" ? "inbound:create" : "purchase:create";
    if (!hasPermission(session, permission)) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const orderId = generateOrderId();

    const purchase = await prisma.purchaseOrder.create({
      data: {
        id: orderId,
        type: type || undefined,
        status: status || "Draft",
        date: date ? new Date(date) : new Date(),
        totalAmount: Number(totalAmount) || 0,
        shippingFees: Number(shippingFees) || 0,
        extraFees: Number(extraFees) || 0,
        paymentVouchers: paymentVouchers || [],
        trackingData: trackingData || [],
        workspaceId: session.workspaceId,
        items: {
          create: items.map((item: PurchaseOrderItem) => ({
            productId: item.productId,
            supplierId: item.supplierId,
            quantity: Number(item.quantity) || 0,
            remainingQuantity: status === "Received" ? (Number(item.quantity) || 0) : undefined,
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

    // 如果状态是 Received，增加商品库存
    if (status === "Received") {
      for (const item of items) {
        const product = await prisma.product.findUnique({
          where: { id: item.productId }
        });

        if (product) {
          const incomingQty = Number(item.quantity) || 0;

          await prisma.product.update({
            where: { id: item.productId },
            data: {
              stock: { increment: incomingQty }
            }
          });
        }
      }
    }

    return NextResponse.json(purchase);
  } catch (error) {
    console.error("Failed to create purchase order:", error);
    return NextResponse.json({ error: "Failed to create purchase order" }, { status: 500 });
  }
}
