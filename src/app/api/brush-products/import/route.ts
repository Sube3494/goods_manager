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

      const product = sku
        ? await prisma.product.findFirst({
            where: {
              sku,
              ...(user.role === "SUPER_ADMIN"
                ? {}
                : {
                    OR: [{ userId: user.id }, { isPublic: true }],
                  }),
            },
            select: { id: true },
          })
        : await prisma.product.findFirst({
            where: {
              name,
              ...(user.role === "SUPER_ADMIN"
                ? {}
                : {
                    OR: [{ userId: user.id }, { isPublic: true }],
                  }),
            },
            select: { id: true },
          });

      if (!product) {
        results.failed += 1;
        results.errors.push(`第 ${rowNumber} 行：找不到匹配商品${sku ? `（${sku}）` : `（${name}）`}`);
        continue;
      }

      const existing = await prisma.brushProduct.findFirst({
        where: {
          userId: user.id,
          productId: product.id,
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
          productId: product.id,
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
