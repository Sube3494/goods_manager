import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getStorageStrategy } from "@/lib/storage";
import { PurchaseOrderItem, TrackingInfo } from "@/lib/types";
import { Prisma } from "../../../../prisma/generated-client";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { FinanceMath } from "@/lib/math";
import { AUTO_INBOUND_TYPE } from "@/lib/purchaseOrderTypes";

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
              supplier: true
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
    const storage = await getStorageStrategy();
    const resolvedPurchases = purchases.map(po => ({
      ...po,
      paymentVouchers: Array.isArray(po.paymentVouchers) ? po.paymentVouchers.map(v => typeof v === 'string' ? storage.resolveUrl(v) : v) : po.paymentVouchers,
      trackingData: Array.isArray(po.trackingData) ? (po.trackingData as unknown as (TrackingInfo & { url?: string })[]).map(t => ({ 
        ...t, 
        url: t.url ? storage.resolveUrl(t.url) : t.url,
        waybillImage: t.waybillImage ? storage.resolveUrl(t.waybillImage) : t.waybillImage,
        waybillImages: Array.isArray(t.waybillImages) ? t.waybillImages.map(img => storage.resolveUrl(img)) : t.waybillImages
      })) : po.trackingData,
      items: po.items.map(item => ({
        ...item,
        shopProduct: item.shopProduct ? {
          ...item.shopProduct,
          image: item.shopProduct.productImage ? storage.resolveUrl(item.shopProduct.productImage) : null
        } : null,
        product: item.product ? {
          ...item.product,
          image: item.product.image ? storage.resolveUrl(item.product.image) : null
        } : null
      }))
    }));

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

    const purchase = await prisma.$transaction(async (tx) => {
      const p = await tx.purchaseOrder.create({
        data: {
          id: orderId,
          type: type || undefined,
          status: status || "Draft",
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
            create: items.map((item: PurchaseOrderItem) => ({
              productId: item.productId || null,
              shopProductId: item.shopProductId || null,
              supplierId: item.supplierId,
              quantity: Number(item.quantity) || 0,
              remainingQuantity: status === "Received" ? (Number(item.quantity) || 0) : undefined,
              costPrice: FinanceMath.add(Number(item.costPrice) || 0, 0)
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

      // 如果状态是 Received，增加商品库存 (原子事务)
      if (status === "Received") {
        for (const item of items) {
          if (item.shopProductId) {
            await tx.shopProduct.update({
              where: { id: item.shopProductId },
              data: {
                stock: { increment: Number(item.quantity) || 0 }
              }
            });
          } else if (item.productId) {
            await tx.product.update({
              where: { id: item.productId },
              data: {
                stock: { increment: Number(item.quantity) || 0 }
              }
            });
          }
        }
      }
      
      return p;
    });

    return NextResponse.json(purchase);
  } catch (error) {
    console.error("Failed to create purchase order:", error);
    return NextResponse.json({ error: "Failed to create purchase order" }, { status: 500 });
  }
}
