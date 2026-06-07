import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from '../../../../prisma/generated-client';
import { getAuthorizedUser } from "@/lib/auth";
import { InventoryService } from "@/services/inventoryService";
import { FinanceMath } from "@/lib/math";
import { getStorageStrategy } from "@/lib/storage";
import { parseFactoryShipmentNote, generateOutboundId } from "@/lib/utils";
import { collectFactoryShipmentCustomer } from "@/lib/customerAddressBook";
 
interface OutboundItem {
  productId?: string | null;
  productVariantId?: string | null;
  shopProductId?: string;
  shopProductVariantId?: string | null;
  variantName?: string | null;
  variantSku?: string | null;
  quantity: number;
  price?: number;
}

export async function GET(request: Request) {
  try {
    const user = await getAuthorizedUser("outbound:manage");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope");
    const excludeReturned = searchParams.get("excludeReturned") === "1";

    const where: Prisma.OutboundOrderWhereInput = {
      userId: user.id,
    };

    if (excludeReturned) {
      where.status = { notIn: ["Returned", "已退回"] };
    }

    if (scope === "factory-shipments") {
      where.AND = [
        {
          OR: [
            { note: { contains: "[厂家发货]" } },
            { note: { contains: "[销售]" } },
          ],
        },
      ];
    }

    const orders = await prisma.outboundOrder.findMany({
      where,
      include: {
        items: {
          include: {
            product: true,
            productVariant: true,
            shopProduct: {
              include: {
                shop: { select: { id: true, name: true } }
              }
            },
            shopProductVariant: true,
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
        productVariant: item.productVariant ? {
          ...item.productVariant,
          image: item.productVariant.image ? storage.resolveUrl(item.productVariant.image) : item.productVariant.image,
        } : item.productVariant,
        shopProductVariant: item.shopProductVariant ? {
          ...item.shopProductVariant,
          image: item.shopProductVariant.variantImage ? storage.resolveUrl(item.shopProductVariant.variantImage) : null,
        } : item.shopProductVariant,
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
    const requestedStatus = typeof body?.status === "string" ? body.status.trim() : "";
    const finalStatus = requestedStatus || (type === "FactoryShipment" ? "待发货" : "");

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Invalid items" }, { status: 400 });
    }

    const requestedShopProductIds = items
      .map((item: OutboundItem) => item.shopProductId)
      .filter((id: unknown): id is string => typeof id === "string" && id.trim() !== "");
    const requestedShopProductVariantIds = items
      .map((item: OutboundItem) => item.shopProductVariantId)
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
    const shopProductVariants = requestedShopProductVariantIds.length > 0
      ? await prisma.shopProductVariant.findMany({
          where: {
            id: { in: requestedShopProductVariantIds },
            shopProduct: { shop: { userId: user.id } },
          },
          select: {
            id: true,
            shopProductId: true,
            productVariantId: true,
            sku: true,
            variantName: true,
            shopProduct: {
              select: {
                productId: true,
              },
            },
          }
        })
      : [];
    const shopProductMap = new Map(shopProducts.map((item) => [item.id, item]));
    const shopProductVariantMap = new Map(shopProductVariants.map((item) => [item.id, item]));
    const normalizedItems = items.map((item: OutboundItem) => {
      const shopProductVariant = item.shopProductVariantId ? shopProductVariantMap.get(item.shopProductVariantId) : null;
      const shopProduct = item.shopProductId ? shopProductMap.get(item.shopProductId) : null;
      return {
        productId: shopProductVariant?.shopProduct.productId || shopProduct?.productId || item.productId || null,
        productVariantId: shopProductVariant?.productVariantId || item.productVariantId || null,
        shopProductId: shopProductVariant?.shopProductId || shopProduct?.id || item.shopProductId || null,
        shopProductVariantId: shopProductVariant?.id || item.shopProductVariantId || null,
        variantName: shopProductVariant?.variantName || item.variantName || null,
        variantSku: shopProductVariant?.sku || item.variantSku || null,
        quantity: item.quantity,
        price: item.price,
      };
    });

    const orderId = generateOutboundId(type);

    // 使用事务确保数据原子性，业务逻辑委托给 InventoryService
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. 创建出库单记录
      const order = await tx.outboundOrder.create({
        data: {
          id: orderId,
          type: type || "Sale",
          ...(finalStatus ? { status: finalStatus } : {}),
          date: date ? new Date(date) : new Date(),
          note: note || "",
          userId: user.id,
          items: {
            create: normalizedItems.map((item) => ({
              productId: item.productId || null,
              productVariantId: item.productVariantId || null,
              shopProductId: item.shopProductId || null,
              shopProductVariantId: item.shopProductVariantId || null,
              variantName: item.variantName || null,
              variantSku: item.variantSku || null,
              quantity: item.quantity,
              price: FinanceMath.add(item.price || 0, 0)
            }))
          }
        }
      });

      // 2. 对于厂家发货单，只有在已发货/部分发货状态下才真正执行 FIFO 扣减；普通出库则直接执行。
      const isFactoryShipment = type === "FactoryShipment";
      const shouldDeductStock = !isFactoryShipment || finalStatus === "已发货" || finalStatus === "部分发货";

      if (shouldDeductStock) {
        await InventoryService.processOutboundFIFO(tx, user.id, normalizedItems);
      }

      // 3. 自动将厂家发货单的新收件信息沉淀到客户管理
      try {
        const parsed = parseFactoryShipmentNote(note);
        if (parsed.isFactoryShipment) {
          const isShipped = finalStatus === "已发货" || finalStatus === "部分发货";
          await collectFactoryShipmentCustomer(tx, user.id, parsed, isShipped);
        }
      } catch (err) {
        console.error("Failed to auto-collect customer during outbound creation:", err);
      }

      return order;
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process outbound order";
    console.error("Outbound processing failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
