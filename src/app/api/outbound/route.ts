import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from '../../../../prisma/generated-client';
import { getAuthorizedUser } from "@/lib/auth";
import { InventoryService } from "@/services/inventoryService";
import { FinanceMath } from "@/lib/math";
import { getStorageStrategy } from "@/lib/storage";
 
interface OutboundItem {
  productId: string;
  shopProductId?: string;
  quantity: number;
  price?: number;
}

export async function GET() {
  try {
    const user = await getAuthorizedUser("outbound:manage");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    }

    const orders = await prisma.outboundOrder.findMany({
      where: { userId: user.id },
      include: {
        items: {
          include: {
            product: true,
            shopProduct: {
              include: {
                shop: { select: { id: true, name: true } }
              }
            }
          }
        }
      },
      orderBy: { date: 'desc' }
    });
    const storage = await getStorageStrategy();
    const normalizedOrders = orders.map((order) => ({
      ...order,
      items: order.items.map((item) => ({
        ...item,
        product: item.product ? {
          ...item.product,
          image: item.product.image ? storage.resolveUrl(item.product.image) : item.product.image,
        } : item.product,
        shopProduct: item.shopProduct ? {
          id: item.shopProduct.id,
          productId: item.shopProduct.productId,
          sourceProductId: item.shopProduct.sourceProductId,
          sku: item.shopProduct.sku,
          name: item.shopProduct.productName || item.product?.name || "未知商品",
          image: item.shopProduct.productImage ? storage.resolveUrl(item.shopProduct.productImage) : (item.product?.image ? storage.resolveUrl(item.product.image) : null),
          categoryId: item.shopProduct.categoryId,
          categoryName: item.shopProduct.categoryName,
          supplierId: item.shopProduct.supplierId,
          costPrice: item.shopProduct.costPrice,
          stock: item.shopProduct.stock,
          shopId: item.shopProduct.shopId,
          shopName: item.shopProduct.shop?.name || null,
          isPublic: item.shopProduct.isPublic,
          isDiscontinued: item.shopProduct.isDiscontinued,
          remark: item.shopProduct.remark,
          specs: item.shopProduct.specs as Record<string, string> | null,
          createdAt: item.shopProduct.createdAt,
          updatedAt: item.shopProduct.updatedAt,
        } : item.shopProduct,
      })),
    }));
    return NextResponse.json(normalizedOrders);
  } catch (error) {
    console.error("Failed to fetch outbound orders:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthorizedUser("outbound:manage");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    }

    const body = await request.json();
    const { type, date, note, items } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Invalid items" }, { status: 400 });
    }

    const requestedShopProductIds = items
      .map((item: OutboundItem) => item.shopProductId)
      .filter((id: unknown): id is string => typeof id === "string" && id.trim() !== "");

    const shopProducts = requestedShopProductIds.length > 0
      ? await prisma.shopProduct.findMany({
          where: {
            id: { in: requestedShopProductIds },
            shop: { userId: user.id },
          },
          select: {
            id: true,
            productId: true,
          }
        })
      : [];
    const shopProductMap = new Map(shopProducts.map((item) => [item.id, item]));
    const normalizedItems = items.map((item: OutboundItem) => {
      const shopProduct = item.shopProductId ? shopProductMap.get(item.shopProductId) : null;
      return {
        productId: shopProduct?.productId || item.productId,
        shopProductId: shopProduct?.id || null,
        quantity: item.quantity,
        price: item.price,
      };
    });

    // 使用事务确保数据原子性，业务逻辑委托给 InventoryService
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. 创建出库单记录
      const order = await tx.outboundOrder.create({
        data: {
          type: type || "Sale",
          date: date ? new Date(date) : new Date(),
          note: note || "",
          userId: user.id,
          items: {
            create: normalizedItems.map((item) => ({
              productId: item.productId,
              shopProductId: item.shopProductId || null,
              quantity: item.quantity,
              price: FinanceMath.add(item.price || 0, 0)
            }))
          }
        }
      });

      // 2. 委托 Service 处理 FIFO 扣减及库存更新
      await InventoryService.processOutboundFIFO(tx, user.id, normalizedItems);

      return order;
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process outbound order";
    console.error("Outbound processing failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
