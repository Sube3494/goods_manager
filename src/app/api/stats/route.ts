import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";

// 获取首页仪表盘统计数据
export async function GET() {
  try {
    const user = await getAuthorizedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. 获取系统设置 (基于用户或全局)
    const settings = await prisma.systemSetting.findFirst({
      where: { userId: user.id }
    });
    const threshold = settings?.lowStockThreshold ?? 10;

    const [
      productCount,
      totalStock,
      lowStockCount,
      totalValueResult,
      recentInboundItems,
      pendingOrderCount
    ] = await Promise.all([
      prisma.product.count({
        where: { userId: user.id }
      }),
      prisma.product.aggregate({
        where: { userId: user.id },
        _sum: {
          stock: true
        }
      }),
      prisma.product.count({
        where: {
          userId: user.id,
          stock: {
            lt: threshold
          }
        }
      }),
      // OPTIMIZATION: Use raw query for multi-column aggregation (price * quantity)
      prisma.$queryRaw<[{ sum: number | null }]>`
        SELECT SUM("costPrice" * "remainingQuantity") as sum 
        FROM "PurchaseOrderItem" poi
        JOIN "PurchaseOrder" po ON poi."purchaseOrderId" = po.id
        WHERE poi."remainingQuantity" > 0 
        AND po."userId" = ${user.id}
        AND po.status = 'Received'
      `,
      // Query individual product items from received orders
      prisma.purchaseOrderItem.findMany({
        take: 10,
        where: {
          purchaseOrder: {
            userId: user.id,
            status: "Received"
          }
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              image: true
            }
          },
          supplier: {
            select: {
              id: true,
              name: true
            }
          },
          purchaseOrder: {
            select: {
              id: true,
              date: true,
              status: true
            }
          }
        },
        orderBy: {
          purchaseOrder: {
            date: 'desc'
          }
        }
      }),
      // 获取待入库订单数量 (Status = Ordered)
      prisma.purchaseOrder.count({
        where: {
          userId: user.id,
          status: "Ordered"
        }
      })
    ]);

    // Transform inbound items to include subtotal
    const transformedInboundItems = recentInboundItems.map(item => ({
      id: item.id,
      productId: item.productId,
      product: item.product,
      supplier: item.supplier,
      quantity: item.quantity,
      costPrice: item.costPrice,
      purchaseOrder: item.purchaseOrder,
      subtotal: item.quantity * item.costPrice
    }));

    const totalValue = Number(totalValueResult?.[0]?.sum || 0);

    return NextResponse.json({
      productCount,
      totalStock: totalStock._sum.stock || 0,
      lowStockCount,
      totalValue,
      recentInboundItems: transformedInboundItems,
      pendingInboundCount: pendingOrderCount
    });
  } catch (error) {
    if (error instanceof Error) {
        console.error("Failed to fetch stats (Detailed):", error.message, error.stack);
    } else {
        console.error("Failed to fetch stats (Detailed):", error);
    }
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
