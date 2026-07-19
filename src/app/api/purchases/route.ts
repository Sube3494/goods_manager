import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getStorageStrategy } from "@/lib/storage";
import { PurchaseOrderItem, TrackingInfo } from "@/lib/types";
import { Prisma } from "../../../../prisma/generated-client";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { FinanceMath } from "@/lib/math";
import { AUTO_INBOUND_TYPE } from "@/lib/purchaseOrderTypes";
import { sanitizePurchaseOrderItems } from "@/lib/purchaseOrderItems";
import { InventoryService } from "@/services/inventoryService";
import { allocateShippingToPurchaseItems, calculatePurchaseOrderTotalAmount } from "@/lib/purchaseCosting";
import { parseAsShanghaiTime } from "@/lib/dateUtils";

export async function resolvePurchaseOrderResponse<T extends {
  status?: string;
  paymentVouchers?: unknown;
  trackingData?: unknown;
  items: Array<{
    shopProduct?: {
      productImage?: string | null;
      productName?: string | null;
    } | null;
    product?: {
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
            image: item.shopProduct.productImage
              ? storage.resolveUrl(item.shopProduct.productImage)
              : item.product?.image
              ? storage.resolveUrl(item.product.image)
              : null,
          }
        : null,
      product: item.product
        ? {
            ...item.product,
            image: item.product.image ? storage.resolveUrl(item.product.image) : null,
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
  const orderId = String(searchParams.get("orderId") || searchParams.get("id") || "").trim();
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
    if (orderId) {
      andWhere.push({ id: orderId });
    }
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
              { shopProductId: productId },
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
              shopProduct: true,
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
      shopName,
      note,
    } = body;


    // 权限检查
    const permission = type === "Inbound" ? "inbound:manage" : "purchase:manage";
    if (!hasPermission(session, permission)) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const orderId = generateOrderId();

    const normalizedStatus = status === "Draft" ? "Confirmed" : (status || "Confirmed");

    const purchase = await prisma.$transaction(async (tx) => {
      const sanitizedItems = await sanitizePurchaseOrderItems(tx, Array.isArray(items) ? items : []);
      const normalizedShippingFees = FinanceMath.add(Number(shippingFees) || 0, 0);
      const normalizedExtraFees = FinanceMath.add(Number(extraFees) || 0, 0);
      const normalizedDiscountAmount = FinanceMath.add(Number(discountAmount) || 0, 0);
      const costAllocatedItems = allocateShippingToPurchaseItems(
        sanitizedItems,
        normalizedShippingFees,
        normalizedExtraFees
      );
      const normalizedTotalAmount = calculatePurchaseOrderTotalAmount({
        items: sanitizedItems,
        shippingFees: normalizedShippingFees,
        extraFees: normalizedExtraFees,
        discountAmount: normalizedDiscountAmount,
      });

      const p = await tx.purchaseOrder.create({
        data: {
          id: orderId,
          type: type || undefined,
          status: normalizedStatus,
          date: date ? parseAsShanghaiTime(date) : new Date(),
          totalAmount: normalizedTotalAmount,
          shippingFees: normalizedShippingFees,
          extraFees: normalizedExtraFees,
          discountAmount: normalizedDiscountAmount,

          paymentVouchers: paymentVouchers || [],
          trackingData: trackingData || [],
          shippingAddress: shippingAddress || "",
          shopName: shopName || "",
          note: String(note || "").trim() || null,
          userId: session.id,
          items: {
            create: costAllocatedItems.map((item: PurchaseOrderItem) => ({
              productId: item.productId || null,
              shopProductId: item.shopProductId || null,
              supplierId: item.supplierId,
              quantity: Number(item.quantity) || 0,
              remainingQuantity: normalizedStatus === "Received" ? (Number(item.quantity) || 0) : undefined,
              costPrice: FinanceMath.add(Number(item.costPrice) || 0, 0)
            }))
          }
        },
        include: {
          items: {
            include: {
              product: true,
              shopProduct: true,
              supplier: true
            }
          }
        }
      });

      // 如果状态是 Received，更新店铺商品成本价，并调用同步物理库存 (原子事务)
      if (normalizedStatus === "Received") {
        for (const item of costAllocatedItems) {
          if (item.shopProductId) {
            const incomingCost = FinanceMath.add(Number(item.costPrice) || 0, 0);
            if (incomingCost > 0) {
              await tx.shopProduct.update({
                where: { id: item.shopProductId },
                data: { costPrice: incomingCost }
              });
            }
            await InventoryService.syncStockFromBatches(tx, item.productId || null, item.shopProductId);
          } else if (item.productId) {
            await InventoryService.syncStockFromBatches(tx, item.productId, null);
          }
        }
      }
      
      return p;
    });

    return NextResponse.json(await resolvePurchaseOrderResponse(purchase));
  } catch (error) {
    console.error("Failed to create purchase order:", error);
    return NextResponse.json({ error: "Failed to create purchase order" }, { status: 500 });
  }
}
