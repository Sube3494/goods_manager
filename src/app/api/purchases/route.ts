import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getStorageStrategy } from "@/lib/storage";
import { PurchaseOrderItem, TrackingInfo } from "@/lib/types";
import { Prisma } from "../../../../prisma/generated-client";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { FinanceMath } from "@/lib/math";
import { AUTO_INBOUND_TYPE } from "@/lib/purchaseOrderTypes";
import { InventoryService } from "@/services/inventoryService";

async function resolvePurchaseOrderResponse<T extends {
  status?: string;
  paymentVouchers?: unknown;
  trackingData?: unknown;
  items: Array<{
    shopProduct?: {
      productImage?: string | null;
      productName?: string | null;
    } | null;
    shopProductVariant?: {
      variantImage?: string | null;
    } | null;
    product?: {
      image?: string | null;
    } | null;
    productVariant?: {
      image?: string | null;
    } | null;
  }>;
}>(purchase: T) {
  const storage = await getStorageStrategy();
  const normalizedStatus = purchase.status === "Draft" ? "Confirmed" : purchase.status;

  return {
    ...purchase,
    status: normalizedStatus,
    paymentVouchers: Array.isArray(purchase.paymentVouchers)
      ? purchase.paymentVouchers.map((voucher) => typeof voucher === "string" ? storage.resolveUrl(voucher) : voucher)
      : purchase.paymentVouchers,
    trackingData: Array.isArray(purchase.trackingData)
      ? (purchase.trackingData as (TrackingInfo & { url?: string })[]).map((tracking) => ({
          ...tracking,
          url: tracking.url ? storage.resolveUrl(tracking.url) : tracking.url,
          waybillImage: tracking.waybillImage ? storage.resolveUrl(tracking.waybillImage) : tracking.waybillImage,
          waybillImages: Array.isArray(tracking.waybillImages)
            ? tracking.waybillImages.map((image) => storage.resolveUrl(image))
            : tracking.waybillImages,
        }))
      : purchase.trackingData,
    items: purchase.items.map((item) => ({
      ...item,
      shopProduct: item.shopProduct
        ? {
            ...item.shopProduct,
            name: item.shopProduct.productName || "未命名商品",
            image: item.shopProduct.productImage ? storage.resolveUrl(item.shopProduct.productImage) : null,
          }
        : null,
      shopProductVariant: item.shopProductVariant
        ? {
            ...item.shopProductVariant,
            image: item.shopProductVariant.variantImage ? storage.resolveUrl(item.shopProductVariant.variantImage) : null,
          }
        : null,
      product: item.product
        ? {
            ...item.product,
            image: item.product.image ? storage.resolveUrl(item.product.image) : null,
          }
        : null,
      productVariant: item.productVariant
        ? {
            ...item.productVariant,
            image: item.productVariant.image ? storage.resolveUrl(item.productVariant.image) : null,
          }
        : null,
    })),
  };
}

// 获取所有采购订单
export async function GET(request: Request) {
  const session = await getFreshSession() as SessionUser | null;
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const productId = searchParams.get("productId");
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "50");
  const skip = (page - 1) * pageSize;

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 权限检查
  const permission = type === "Inbound" ? "inbound:manage" : "purchase:manage";
  if (!hasPermission(session, permission)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const andWhere: Prisma.PurchaseOrderWhereInput[] = [];
    if (type === "Inbound") {
      andWhere.push({
        OR: [
          { type: "Inbound" },
          { type: AUTO_INBOUND_TYPE },
          { type: "Return" },
          { type: "InternalReturn" },
          { status: "Received" },
        ],
      });
    } else if (type) {
      andWhere.push({ type });
    } else {
      andWhere.push({
        NOT: {
          OR: [
            { type: "Inbound" },
            { type: AUTO_INBOUND_TYPE },
            { type: "Return" },
            { type: "InternalReturn" },
          ],
        },
      });
    }
    if (productId) {
      andWhere.push({
        items: {
          some: {
            OR: [
              { productId },
              { productVariantId: productId },
              { shopProductId: productId },
              { shopProductVariantId: productId },
            ],
          }
        },
      });
    }
    const where: Prisma.PurchaseOrderWhereInput = andWhere.length > 0 ? { AND: andWhere } : {};

    const [purchases, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where: {
          ...where,
          userId: session.id
        },
        include: {
          items: {
            include: {
              product: true,
              productVariant: true,
              shopProduct: true,
              shopProductVariant: true,
              supplier: true,
              batches: true
            }
          }
        },
        orderBy: {
          date: 'desc'
        },
        skip,
        take: pageSize,
      }),
      prisma.purchaseOrder.count({
        where: {
          ...where,
          userId: session.id
        }
      })
    ]);
    const resolvedPurchases = await Promise.all(purchases.map((purchase) => resolvePurchaseOrderResponse(purchase)));

    return NextResponse.json({
      items: resolvedPurchases,
      total,
      page,
      pageSize,
      hasMore: (skip + purchases.length) < total
    });
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
    if (!session || !session.id) {
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
      discountAmount,
      trackingData,
      paymentVouchers,
      shippingAddress,
      shopName
    } = body;


    // 权限检查
    const permission = type === "Inbound" ? "inbound:manage" : "purchase:manage";
    if (!hasPermission(session, permission)) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const orderId = generateOrderId();

    const normalizedStatus = status === "Draft" ? "Confirmed" : (status || "Confirmed");
    const requestedShopProductVariantIds = Array.isArray(items)
      ? items
          .map((item: PurchaseOrderItem) => item.shopProductVariantId)
          .filter((id: unknown): id is string => typeof id === "string" && id.trim() !== "")
      : [];

    const shopProductVariants = requestedShopProductVariantIds.length > 0
      ? await prisma.shopProductVariant.findMany({
          where: {
            id: { in: requestedShopProductVariantIds },
            shopProduct: {
              shop: { userId: session.id },
            },
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
          },
        })
      : [];
    const shopProductVariantMap = new Map(shopProductVariants.map((item) => [item.id, item]));
    const normalizedItems = Array.isArray(items)
      ? items.map((item: PurchaseOrderItem) => {
          const shopProductVariant = item.shopProductVariantId ? shopProductVariantMap.get(item.shopProductVariantId) : null;
          return {
            productId: shopProductVariant?.shopProduct.productId || item.productId || null,
            productVariantId: shopProductVariant?.productVariantId || item.productVariantId || null,
            shopProductId: shopProductVariant?.shopProductId || item.shopProductId || null,
            shopProductVariantId: shopProductVariant?.id || item.shopProductVariantId || null,
            supplierId: item.supplierId,
            variantName: shopProductVariant?.variantName || item.variantName || null,
            variantSku: shopProductVariant?.sku || item.variantSku || null,
            quantity: Number(item.quantity) || 0,
            remainingQuantity: normalizedStatus === "Received" ? (Number(item.quantity) || 0) : undefined,
            costPrice: FinanceMath.add(Number(item.costPrice) || 0, 0),
          };
        })
      : [];

    const purchase = await prisma.$transaction(async (tx) => {
      const p = await tx.purchaseOrder.create({
        data: {
          id: orderId,
          type: type || undefined,
          status: normalizedStatus,
          date: date ? new Date(date) : new Date(),
          totalAmount: FinanceMath.add(Number(totalAmount) || 0, 0),
          shippingFees: FinanceMath.add(Number(shippingFees) || 0, 0),
          extraFees: FinanceMath.add(Number(extraFees) || 0, 0),
          discountAmount: FinanceMath.add(Number(discountAmount) || 0, 0),

          paymentVouchers: paymentVouchers || [],
          trackingData: trackingData || [],
          shippingAddress: shippingAddress || "",
          shopName: shopName || "",
          userId: session.id,
          items: {
            create: normalizedItems.map((item) => ({
              ...item,
            }))
          }
        },
        include: {
          items: {
            include: {
              product: true,
              productVariant: true,
              shopProduct: true,
              shopProductVariant: true,
              supplier: true
            }
          }
        }
      });

      // 如果状态是 Received，调用同步物理库存 (原子事务)
      if (normalizedStatus === "Received") {
        for (const item of normalizedItems) {
          await InventoryService.syncStockFromBatches(
            tx,
            item.productId || null,
            item.shopProductId || null,
            item.productVariantId || null,
            item.shopProductVariantId || null
          );
        }
      }
      
      return await tx.purchaseOrder.findUniqueOrThrow({
        where: { id: p.id },
        include: {
          items: {
            include: {
              product: true,
              productVariant: true,
              shopProduct: true,
              shopProductVariant: true,
              supplier: true,
            },
          },
        },
      });
    });

    return NextResponse.json(await resolvePurchaseOrderResponse(purchase));
  } catch (error) {
    console.error("Failed to create purchase order:", error);
    return NextResponse.json({ error: "Failed to create purchase order" }, { status: 500 });
  }
}
