import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { handlePrismaError } from "@/lib/api-errors";

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
      return NextResponse.json({ error: "未提供需要更新的商品数据" }, { status: 400 });
    }

    const shop = await prisma.shop.findFirst({
      where: {
        id: shopId,
        ...(user.role === "SUPER_ADMIN" ? {} : { userId: user.id }),
      },
      select: { id: true },
    });

    if (!shop) {
      return NextResponse.json({ error: "店铺不存在或无访问权限" }, { status: 404 });
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

    // 1. 校验本次提交列表内部的 SKU 是否存在相互重复
    const skuMap = new Map<string, string>();
    for (const update of updates) {
      if ("sku" in update) {
        const normalized = normalizeSku(update.sku);
        if (normalized) {
          if (skuMap.has(normalized)) {
            return NextResponse.json({
              error: `提交的数据中商品编码 (SKU) "${normalized}" 重复，请检查修改`
            }, { status: 400 });
          }
          skuMap.set(normalized, update.id);
        }
      }
    }

    // 2. 校验提交的 SKU 是否与当前店铺现存的其他商品发生唯一键冲突
    const skusToCheck = Array.from(skuMap.keys());
    if (skusToCheck.length > 0) {
      const conflictingItem = await prisma.shopProduct.findFirst({
        where: {
          shopId,
          sku: { in: skusToCheck },
          id: { notIn: requestedIds },
        },
        select: { sku: true, productName: true },
      });
      if (conflictingItem && conflictingItem.sku) {
        return NextResponse.json({
          error: `店铺商品编码 (SKU) "${conflictingItem.sku}" 已存在于商品「${conflictingItem.productName || "未知商品"}」，请使用其他编码`,
        }, { status: 409 });
      }
    }

    // 3. 检查是否存在互相重叠占用旧 SKU 的情况（如商品互换 SKU），若有则先临时将该批次旧 SKU 清空以防触发唯一索引冲突
    if (skusToCheck.length > 0) {
      const existingItemsWithSku = await prisma.shopProduct.findMany({
        where: { id: { in: requestedIds }, sku: { not: null } },
        select: { id: true, sku: true },
      });
      const needsTempClear = updates.some((u: { id: string; sku?: string }) => {
        if (!("sku" in u)) return false;
        const newSku = normalizeSku(u.sku);
        if (!newSku) return false;
        return existingItemsWithSku.some((other) => other.id !== u.id && other.sku === newSku);
      });

      if (needsTempClear) {
        await prisma.shopProduct.updateMany({
          where: { id: { in: requestedIds } },
          data: { sku: null },
        });
      }
    }

    // 4. 受控并发分批更新（每批 15 条，防止打爆数据库连接池）
    const CHUNK_SIZE = 15;
    const allResults = [];

    for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
      const chunk = updates.slice(i, i + CHUNK_SIZE);
      const chunkResults = await Promise.all(
        chunk.map(async (item: {
          id: string;
          sku?: string;
          costPrice?: number;
          sortNumber?: number | string | null;
          sortGroupName?: string | null;
          sortCategoryName?: string | null;
        }) => {
          const data: {
            sku?: string | null;
            costPrice?: number;
            sortNumber?: number | null;
            sortGroupName?: string | null;
            sortCategoryName?: string | null;
          } = {};

          if ("sku" in item) {
            data.sku = normalizeSku(item.sku);
          }
          if ("costPrice" in item) {
            const numPrice = Number(item.costPrice);
            data.costPrice = Number.isFinite(numPrice) && numPrice >= 0 ? numPrice : 0;
          }
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
        })
      );
      allResults.push(...chunkResults);
    }

    return NextResponse.json({
      success: true,
      count: allResults.length,
      items: allResults,
    });
  } catch (error) {
    console.error("Failed to batch update shop products:", error);
    return handlePrismaError(error, "店铺商品", "批量更新店铺商品失败");
  }
}
