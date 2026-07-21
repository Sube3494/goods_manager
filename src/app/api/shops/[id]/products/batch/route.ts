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

    const updatePromises = updates.map(async (item: { id: string; sku: string; costPrice: number }) => {
      const normalizedSku = normalizeSku(item.sku);
      const numPrice = Number(item.costPrice);
      const costPrice = Number.isFinite(numPrice) && numPrice >= 0 ? numPrice : 0;

      return prisma.shopProduct.update({
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
    console.error("Failed to batch update shop products:", error);
    return NextResponse.json({ error: "Failed to batch update shop products" }, { status: 500 });
  }
}
