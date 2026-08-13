import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";

function normalizeSku(sku: unknown) {
  if (typeof sku !== "string") {
    return null;
  }
  const trimmed = sku.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSortNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthorizedUser("product:update");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    }

    const { id: shopId } = await params;
    if (!shopId) {
      return NextResponse.json({ error: "Missing shop ID" }, { status: 400 });
    }

    const body = await request.json();
    const updates = Array.isArray(body?.updates) ? body.updates : Array.isArray(body?.items) ? body.items : [];

    if (updates.length === 0) {
      return NextResponse.json({ error: "No update items provided" }, { status: 400 });
    }

    const shop = await prisma.shop.findFirst({
      where: {
        id: shopId,
        ...(user.role === "SUPER_ADMIN" ? {} : { userId: user.id }),
      },
      select: { id: true },
    });

    if (!shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    const requestedIds = updates.map((item: { id?: string }) => String(item.id || "").trim()).filter(Boolean);
    const ownedItems = await prisma.shopProduct.findMany({
      where: { id: { in: requestedIds }, shopId },
      select: { id: true },
    });
    const ownedIds = new Set(ownedItems.map((item) => item.id));
    if (ownedIds.size !== requestedIds.length) {
      return NextResponse.json({ error: "存在不属于当前店铺的商品，已停止保存" }, { status: 400 });
    }

    // 校验店铺内部 SKU 重复
    const skuMap = new Map<string, string>();
    for (const update of updates) {
      const normalized = normalizeSku(update.sku);
      if (normalized) {
        if (skuMap.has(normalized)) {
          return NextResponse.json({
            error: `店铺内提交的 SKU 编码 "${normalized}" 重复，请检查`
          }, { status: 400 });
        }
        skuMap.set(normalized, update.id);
      }
    }

    const updatePromises = updates.map(async (item: {
      id: string;
      sku?: string;
      costPrice?: number;
      sortNumber?: number | string | null;
      sortGroupName?: string | null;
      sortCategoryName?: string | null;
    }) => {
      const normalizedSku = normalizeSku(item.sku);
      const numPrice = Number(item.costPrice);
      const costPrice = Number.isFinite(numPrice) && numPrice >= 0 ? numPrice : 0;
      const data: {
        sku: string | null;
        costPrice: number;
        sortNumber?: number | null;
        sortGroupName?: string | null;
        sortCategoryName?: string | null;
      } = {
        sku: normalizedSku,
        costPrice,
      };

      if ("sortNumber" in item) data.sortNumber = normalizeSortNumber(item.sortNumber);
      if ("sortGroupName" in item) data.sortGroupName = normalizeText(item.sortGroupName);
      if ("sortCategoryName" in item) data.sortCategoryName = normalizeText(item.sortCategoryName);

      return prisma.shopProduct.update({
        where: { id: item.id },
        data,
        select: {
          id: true,
          sku: true,
          costPrice: true,
          sortNumber: true,
          sortGroupName: true,
          sortCategoryName: true,
        },
      });
    });

    const results = await Promise.all(updatePromises);

    return NextResponse.json({
      success: true,
      count: results.length,
      items: results,
    });
  } catch (error) {
    console.error("Failed to batch update shop products:", error);
    return NextResponse.json({ error: "Failed to batch update shop products" }, { status: 500 });
  }
}
