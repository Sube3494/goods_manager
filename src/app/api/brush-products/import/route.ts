import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function extractRowValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (normalizeText(value) !== "") {
      return value;
    }
  }
  return "";
}

export async function POST(request: Request) {
  try {
    const user = await getAuthorizedUser("brush:manage");
    if (!user) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const body = await request.json();
    const rows = Array.isArray(body)
      ? body
      : Array.isArray(body?.rows)
      ? body.rows
      : null;
    const rawShopId = typeof body?.shopId === "string" ? body.shopId.trim() : "";

    if (!rawShopId) {
      return NextResponse.json({ error: "请先选择店铺后再导入刷单商品" }, { status: 400 });
    }

    const shop = await prisma.shop.findFirst({
      where: user.role === "SUPER_ADMIN"
        ? { id: rawShopId }
        : { id: rawShopId, userId: user.id },
      select: { id: true, name: true },
    });

    if (!shop) {
      return NextResponse.json({ error: "店铺不存在或无权限导入到该店铺" }, { status: 400 });
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "没有可导入的数据" }, { status: 400 });
    }

    const results = {
      success: 0,
      updated: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index] as Record<string, unknown>;
      const rowNumber = index + 1;
      const sku = normalizeText(extractRowValue(row, ["SKU/店内码", "SKU", "sku", "编码"]));
      const name = normalizeText(extractRowValue(row, ["商品名称", "name", "名称"]));
      const brushKeyword = normalizeText(extractRowValue(row, ["刷单关键词", "brushKeyword", "关键词"]));

      if (!sku && !name) {
        results.failed += 1;
        results.errors.push(`第 ${rowNumber} 行：缺少商品名称或 SKU`);
        continue;
      }

      const shopProduct = sku
        ? await prisma.shopProduct.findFirst({
            where: {
              shopId: shop.id,
              sku,
            },
            select: { productId: true },
          })
        : await prisma.shopProduct.findFirst({
            where: {
              shopId: shop.id,
              productName: name,
            },
            select: { productId: true },
          });

      const matchedProductId = typeof shopProduct?.productId === "string" ? shopProduct.productId.trim() : "";

      if (!matchedProductId) {
        results.failed += 1;
        results.errors.push(`第 ${rowNumber} 行：在店铺「${shop.name}」里找不到匹配商品${sku ? `（${sku}）` : `（${name}）`}`);
        continue;
      }

      const existing = await prisma.brushProduct.findFirst({
        where: {
          userId: user.id,
          shopId: shop.id,
          productId: matchedProductId,
        },
        select: { id: true },
      });

      if (existing) {
        await prisma.brushProduct.update({
          where: { id: existing.id },
          data: {
            isActive: true,
            brushKeyword: brushKeyword || null,
          },
        });
        results.updated += 1;
        continue;
      }

      await prisma.brushProduct.create({
        data: {
          userId: user.id,
          productId: matchedProductId,
          shopId: shop.id,
          isActive: true,
          brushKeyword: brushKeyword || null,
        },
      });
      results.success += 1;
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("Failed to import brush products:", error);
    return NextResponse.json({ error: "Failed to import brush products" }, { status: 500 });
  }
}
