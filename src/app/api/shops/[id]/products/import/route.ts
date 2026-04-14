import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { getStorageStrategy } from "@/lib/storage";
import { Prisma } from "../../../../../../../prisma/generated-client";
import { pinyin } from "pinyin-pro";

async function getOwnedShop(shopId: string, userId: string, isAdmin: boolean) {
  return prisma.shop.findFirst({
    where: isAdmin ? { id: shopId } : { id: shopId, userId },
    select: { id: true, name: true, userId: true },
  });
}

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

function generatePinyinSearchText(name: string) {
  if (!name) return "";
  const fullPinyin = pinyin(name, { toneType: "none", type: "string", v: true }).replace(/\s+/g, "");
  const firstLetters = pinyin(name, { pattern: "first", toneType: "none", type: "string" }).replace(/\s+/g, "");
  return `${fullPinyin} ${firstLetters}`.toLowerCase();
}

async function ensureCategory(userId: string | null | undefined, categoryName: string) {
  if (!userId) return null;
  const name = normalizeText(categoryName) || "未分类";
  const existing = await prisma.category.findFirst({
    where: { userId, name },
    select: { id: true, name: true },
  });
  if (existing) return existing;
  return prisma.category.create({
    data: { userId, name },
    select: { id: true, name: true },
  });
}

async function ensureSupplier(userId: string | null | undefined, supplierName: string) {
  if (!userId) return null;
  const name = normalizeText(supplierName);
  if (!name) return null;
  const existing = await prisma.supplier.findFirst({
    where: { userId, name },
    select: { id: true, name: true },
  });
  if (existing) return existing;
  return prisma.supplier.create({
    data: {
      userId,
      name,
      contact: "",
      phone: "",
      email: "",
      address: "",
    },
    select: { id: true, name: true },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthorizedUser("product:update");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    }

    const { id: shopId } = await params;
    const shop = await getOwnedShop(shopId, user.id, user.role === "SUPER_ADMIN");
    if (!shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
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

    const storage = await getStorageStrategy();
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
      const categoryName = normalizeText(extractRowValue(row, ["分类", "categoryName", "类目"])) || "未分类";
      const supplierName = normalizeText(extractRowValue(row, ["供应商", "supplierName"]));
      const image = normalizeText(extractRowValue(row, ["主图", "商品主图", "商品图片", "image"]));
      const costPrice = Number(extractRowValue(row, ["进货单价", "costPrice", "成本价"]) || 0);
      const stock = Number(extractRowValue(row, ["库存", "stock", "当前库存"]) || 0);
      const remark = normalizeText(extractRowValue(row, ["备注", "remark"]));

      if (!sku && !name) {
        results.failed += 1;
        results.errors.push(`第 ${rowNumber} 行：缺少商品名称或 SKU`);
        continue;
      }

      const existing = await prisma.shopProduct.findFirst({
        where: {
          shopId,
          OR: [
            ...(sku ? [{ sku }] : []),
            ...(name ? [{ productName: name }] : []),
          ],
        },
        select: { id: true },
      });

      const category = await ensureCategory(shop.userId, categoryName);
      const supplier = await ensureSupplier(shop.userId, supplierName);
      const normalizedImage = image ? storage.stripUrl(image) || image : null;

      if (existing) {
        await prisma.shopProduct.update({
          where: { id: existing.id },
          data: {
            sku: sku || null,
            productName: name || undefined,
            pinyin: generatePinyinSearchText(name || ""),
            categoryId: category?.id || null,
            categoryName: category?.name || "未分类",
            supplierId: supplier?.id || null,
            productImage: normalizedImage,
            costPrice: Number.isFinite(costPrice) ? costPrice : 0,
            stock: Number.isFinite(stock) ? Math.max(0, Math.trunc(stock)) : 0,
            remark: remark || null,
          },
        });
        results.updated += 1;
        continue;
      }

      const sourceProduct = await prisma.product.findFirst({
        where: {
          isPublic: true,
          OR: [
            ...(sku ? [{ sku }] : []),
            ...(name ? [{ name }] : []),
          ],
        },
        select: {
          id: true,
          name: true,
          image: true,
          isPublic: true,
          isDiscontinued: true,
        },
      });

      if (!sourceProduct) {
        results.failed += 1;
        results.errors.push(`第 ${rowNumber} 行：找不到可加入店铺的公开商品${sku ? `（${sku}）` : `（${name}）`}`);
        continue;
      }

      await prisma.shopProduct.create({
        data: {
          shopId,
          productId: sourceProduct.id,
          sourceProductId: sourceProduct.id,
          sku: sku || null,
          productName: name || sourceProduct.name,
          pinyin: generatePinyinSearchText(name || sourceProduct.name),
          productImage: normalizedImage || sourceProduct.image,
          categoryId: category?.id || null,
          categoryName: category?.name || "未分类",
          supplierId: supplier?.id || null,
          costPrice: Number.isFinite(costPrice) ? costPrice : 0,
          stock: Number.isFinite(stock) ? Math.max(0, Math.trunc(stock)) : 0,
          isPublic: sourceProduct.isPublic,
          isDiscontinued: sourceProduct.isDiscontinued,
          remark: remark || null,
          specs: Prisma.JsonNull,
        },
      });
      results.success += 1;
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("Failed to import shop products:", error);
    return NextResponse.json({ error: "Failed to import shop products" }, { status: 500 });
  }
}
