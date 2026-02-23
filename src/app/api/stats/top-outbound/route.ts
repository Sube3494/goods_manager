import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { getStorageStrategy } from "@/lib/storage";

export async function GET() {
  try {
    const session = await getFreshSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 聚合出库数量
    const outboundItems = await prisma.outboundOrderItem.groupBy({
      by: ['productId'],
      _sum: {
        quantity: true,
      },
      orderBy: {
        _sum: {
          quantity: 'desc'
        }
      },
      take: 10,
    });

    const productIds = outboundItems.map(item => item.productId);
    
    // 获取关联的商品信息
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds }
      },
      select: {
        id: true,
        name: true,
        sku: true,
        image: true,
      }
    });

    const storage = await getStorageStrategy();
    const productMap = new Map(products.map(p => {
        // 如果是本地存储等，需要解析出正确的 HTTP URL
        if (p.image) {
            p.image = storage.resolveUrl(p.image);
        }
        return [p.id, p];
    }));

    const result = outboundItems.map(item => ({
      productId: item.productId,
      totalQuantity: item._sum.quantity || 0,
      product: productMap.get(item.productId) || null
    })).filter(item => item.product !== null); // 剔除可能已经被删除的无效脏数据

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch top outbound:", error);
    return NextResponse.json({ error: "Failed to fetch top outbound stats" }, { status: 500 });
  }
}
