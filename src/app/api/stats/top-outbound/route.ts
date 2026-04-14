import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { getStorageStrategy } from "@/lib/storage";

export async function GET(request: NextRequest) {
  try {
    const session = await getFreshSession();
    if (!session || !session.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const shopName = (request.nextUrl.searchParams.get("shopName") || "").trim();
    const storage = await getStorageStrategy();
    const outboundItems = await prisma.outboundOrderItem.findMany({
      where: {
        outboundOrder: {
          userId: session.id,
          ...(shopName ? { note: { contains: `[店铺:${shopName}]` } } : {}),
        },
      },
      include: {
        outboundOrder: {
          select: {
            date: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            image: true,
          }
        },
        shopProduct: {
          include: {
            shop: {
              select: {
                id: true,
                name: true,
              }
            }
          }
        }
      }
    });

    const aggregateMap = new Map<string, {
      productId: string;
      shopProductId?: string;
      totalQuantity: number;
      latestOutboundAt?: string;
      product: {
        id: string;
        name: string;
        sku: string;
        image: string | null;
      } | null;
    }>();

    for (const item of outboundItems) {
      const key = item.shopProductId || item.productId;
      const current = aggregateMap.get(key);
      const displayProduct = item.shopProduct
        ? {
            id: item.shopProduct.id,
            name: item.shopProduct.productName || item.product?.name || "未知商品",
            sku: item.shopProduct.sku || item.product?.sku || "",
            image: item.shopProduct.productImage
              ? storage.resolveUrl(item.shopProduct.productImage)
              : (item.product?.image ? storage.resolveUrl(item.product.image) : null),
          }
        : (item.product
            ? {
                id: item.product.id,
                name: item.product.name,
                sku: item.product.sku || "",
                image: item.product.image ? storage.resolveUrl(item.product.image) : null,
              }
            : null);

      if (current) {
        current.totalQuantity += item.quantity;
        const outboundAt = item.outboundOrder?.date instanceof Date
          ? item.outboundOrder.date.toISOString()
          : null;
        if (outboundAt && (!current.latestOutboundAt || outboundAt > current.latestOutboundAt)) {
          current.latestOutboundAt = outboundAt;
        }
      } else {
        aggregateMap.set(key, {
          productId: item.productId,
          shopProductId: item.shopProductId || undefined,
          totalQuantity: item.quantity,
          latestOutboundAt: item.outboundOrder?.date instanceof Date ? item.outboundOrder.date.toISOString() : undefined,
          product: displayProduct,
        });
      }
    }

    const result = Array.from(aggregateMap.values())
      .filter(item => item.product !== null)
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, 10);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch top outbound:", error);
    return NextResponse.json({ error: "Failed to fetch top outbound stats" }, { status: 500 });
  }
}
