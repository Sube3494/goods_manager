import { handlePrismaError } from "@/lib/api-errors";
import deletionPrisma from "@/lib/prisma";
import { deleteCatalogProducts } from "@/lib/deleteCatalogProducts";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/catalogPrisma";
import { getAuthorizedUser } from "@/lib/auth";

function normalizeSku(sku: unknown) {
  if (typeof sku !== "string") {
    return null;
  }
  const trimmed = sku.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function PUT(request: Request) {
  try {
    const user = await getAuthorizedUser("product:update");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    }

    const body = await request.json();
    const updates = Array.isArray(body?.updates) ? body.updates : Array.isArray(body?.items) ? body.items : [];

    if (updates.length === 0) {
      return NextResponse.json({ error: "No update items provided" }, { status: 400 });
    }

    // 检查是否有重复的有效 SKU
    const skuMap = new Map<string, string>();
    for (const update of updates) {
      const normalized = normalizeSku(update.sku);
      if (normalized) {
        if (skuMap.has(normalized)) {
          return NextResponse.json({
            error: `批量修改提交的 SKU 编码 "${normalized}" 重复，请检查修改内容`
          }, { status: 400 });
        }
        skuMap.set(normalized, update.id);
      }
    }

    // 在事务中对每个商品执行高效更新
    const updatePromises = updates.map(async (item: { id: string; sku: string; costPrice: number }) => {
      const normalizedSku = normalizeSku(item.sku);
      const numPrice = Number(item.costPrice);
      const costPrice = Number.isFinite(numPrice) && numPrice >= 0 ? numPrice : 0;

      return prisma.product.update({
        where: { id: item.id },
        data: {
          sku: normalizedSku,
          costPrice,
        },
        select: {
          id: true,
          sku: true,
          costPrice: true,
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
    console.error("Failed to batch update products:", error);
    return NextResponse.json({ error: "Failed to batch update products" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getAuthorizedUser("product:update");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    }

    const body = await request.json();
    const { ids, categoryId, supplierId, isDiscontinued, costPrice, isShelfLife, shelfLifeDays, isBundle, bundleItems, isPublic } = body || {};

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "No product IDs provided" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};

    if (typeof isPublic === "boolean") {
      updateData.isPublic = isPublic;
    }
    if (typeof categoryId !== "undefined") {
      updateData.categoryId = categoryId ? String(categoryId) : null;
    }
    if (typeof supplierId !== "undefined") {
      updateData.supplierId = supplierId ? String(supplierId) : null;
    }
    if (typeof isDiscontinued === "boolean") {
      updateData.isDiscontinued = isDiscontinued;
    }
    if (typeof costPrice !== "undefined") {
      const num = Number(costPrice);
      updateData.costPrice = Number.isFinite(num) && num >= 0 ? num : 0;
    }
    if (typeof isShelfLife === "boolean") {
      updateData.isShelfLife = isShelfLife;
    }
    if (typeof shelfLifeDays !== "undefined") {
      const num = Number(shelfLifeDays);
      updateData.shelfLifeDays = Number.isFinite(num) && num >= 0 ? Math.floor(num) : 0;
    }
    if (typeof isBundle === "boolean") {
      updateData.isBundle = isBundle;
      if (!isBundle && bundleItems === undefined) {
        updateData.bundleItems = Prisma.JsonNull;
      }
    }
    if (typeof bundleItems !== "undefined") {
      updateData.bundleItems = Array.isArray(bundleItems) && bundleItems.length > 0 ? bundleItems : (isBundle ? [] : Prisma.JsonNull);
      if (Array.isArray(bundleItems) && bundleItems.length > 0 && typeof isBundle === "undefined") {
        updateData.isBundle = true;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const isSuperAdmin = user.role === "SUPER_ADMIN";
    const result = await prisma.product.updateMany({
      where: {
        id: { in: ids.map(String) },
        ...(isSuperAdmin ? {} : { OR: [{ userId: user.id }, { isPublic: true }] }),
      },
      data: updateData,
    });

    if (typeof updateData.isBundle !== "undefined" || typeof updateData.bundleItems !== "undefined") {
      const shopUpdateData: Record<string, unknown> = {};
      if (typeof updateData.isBundle !== "undefined") shopUpdateData.isBundle = updateData.isBundle;
      if (typeof updateData.bundleItems !== "undefined") shopUpdateData.bundleItems = updateData.bundleItems;
      await prisma.shopProduct.updateMany({
        where: {
          productId: { in: ids.map(String) },
        },
        data: shopUpdateData,
      });
    }

    return NextResponse.json({
      success: true,
      count: result.count,
    });
  } catch (error) {
    console.error("Failed to patch batch products:", error);
    return NextResponse.json({ error: "Failed to batch update products" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getAuthorizedUser("product:delete");
    if (!user) return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    const { ids } = await request.json();
    if (!Array.isArray(ids) || !ids.length) {
      return NextResponse.json({ error: "No product IDs provided" }, { status: 400 });
    }
    const result = await deletionPrisma.$transaction((tx) => deleteCatalogProducts(tx, ids.map(String), user));
    return NextResponse.json({ success: true, ...result, totalProcessed: result.count });
  } catch (error) {
    return handlePrismaError(error, "商品", "Failed to batch delete products");
  }
}
