import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUserAny } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthorizedUserAny("outbound:manage", "product:read", "purchase:manage");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const targetId = String(id || "").trim();
    if (!targetId) {
      return NextResponse.json({ error: "缺少商品 ID" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const shopProductIdParam = searchParams.get("shopProductId")?.trim();

    // 如果传入了 shopProductId，优先查找 shopProduct
    // 否则 targetId 既可能是 productId 也可能是 shopProductId
    let resolvedProductId: string | null = null;
    let resolvedShopProductId: string | null = null;

    if (shopProductIdParam) {
      resolvedShopProductId = shopProductIdParam;
      const sp = await prisma.shopProduct.findFirst({
        where: { id: shopProductIdParam, shop: { userId: user.id } },
        select: { productId: true },
      });
      if (sp?.productId) {
        resolvedProductId = sp.productId;
      }
    } else {
      // 检查是否是 shopProduct
      const sp = await prisma.shopProduct.findFirst({
        where: { id: targetId, shop: { userId: user.id } },
        select: { id: true, productId: true },
      });
      if (sp) {
        resolvedShopProductId = sp.id;
        resolvedProductId = sp.productId || null;
      } else {
        resolvedProductId = targetId;
      }
    }

    const whereConditions: Array<{ productId?: string; shopProductId?: string | null }> = [];
    if (resolvedShopProductId) {
      // 门店商品：只查属于该门店商品的批次（包括历史兼容 productId 等于该 shopProductId）
      // 严禁包含母商品 productId，否则会导致其他门店采购该母商品的批次被全部误查出
      whereConditions.push({ shopProductId: resolvedShopProductId });
      whereConditions.push({ productId: resolvedShopProductId });
    } else if (resolvedProductId) {
      // 总库商品：只查属于总库本身的入库批次，排除各门店批次
      whereConditions.push({ productId: resolvedProductId, shopProductId: null });
    }

    if (whereConditions.length === 0) {
      return NextResponse.json([]);
    }

    const batches = await prisma.purchaseOrderItem.findMany({
      where: {
        purchaseOrder: {
          userId: user.id,
          status: "Received",
        },
        remainingQuantity: {
          gt: 0,
        },
        OR: whereConditions,
      },
      select: {
        id: true,
        quantity: true,
        remainingQuantity: true,
        costPrice: true,
        productId: true,
        shopProductId: true,
        purchaseOrder: {
          select: {
            id: true,
            date: true,
            status: true,
            note: true,
          },
        },
        batches: {
          select: {
            id: true,
            productionDate: true,
            expirationDate: true,
            remainingStock: true,
          },
          take: 1,
        },
      },
      orderBy: {
        purchaseOrder: {
          date: "asc",
        },
      },
    });

    const normalizedBatches = batches.map((item) => {
      const batchMeta = item.batches?.[0];
      return {
        id: item.id,
        purchaseOrderId: item.purchaseOrder.id,
        purchaseDate: item.purchaseOrder.date,
        costPrice: Number(item.costPrice || 0),
        quantity: item.quantity,
        remainingQuantity: item.remainingQuantity ?? item.quantity,
        note: item.purchaseOrder.note || null,
        productionDate: batchMeta?.productionDate || null,
        expirationDate: batchMeta?.expirationDate || null,
      };
    });

    return NextResponse.json(normalizedBatches);
  } catch (error) {
    console.error("Failed to fetch product batches:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

