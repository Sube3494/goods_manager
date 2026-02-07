import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// 获取首页仪表盘统计数据
export async function GET() {
  try {
    const [
      productCount,
      totalStock,
      lowStockCount,
      totalValueResult,
      recentPurchases
    ] = await Promise.all([
      prisma.product.count(),
      prisma.product.aggregate({
        _sum: {
          stock: true
        }
      }),
      prisma.product.count({
        where: {
          stock: {
            lt: 10
          }
        }
      }),
      prisma.product.findMany({
        select: {
          price: true,
          stock: true
        }
      }),
      prisma.purchaseOrder.findMany({
        take: 5,
        orderBy: {
          date: 'desc'
        },
        include: {
          supplier: true
        }
      })
    ]);

    const totalValue = totalValueResult.reduce((acc, curr) => acc + (curr.price * curr.stock), 0);

    return NextResponse.json({
      productCount,
      totalStock: totalStock._sum.stock || 0,
      lowStockCount,
      totalValue,
      recentPurchases
    });
  } catch (error) {
    console.error("Failed to fetch stats:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
