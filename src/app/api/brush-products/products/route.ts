import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { getStorageStrategy } from "@/lib/storage";
import { Prisma } from "../../../../../prisma/generated-client";

const naturalSortCollator = new Intl.Collator("zh-CN", {
  numeric: true,
  sensitivity: "base",
});

function buildSearchWhere(search: string): Prisma.ProductWhereInput | undefined {
  const keyword = search.trim();
  if (!keyword) return undefined;

  return {
    OR: [
      { name: { contains: keyword, mode: "insensitive" } },
      { sku: { contains: keyword, mode: "insensitive" } },
      { remark: { contains: keyword, mode: "insensitive" } },
      { pinyin: { contains: keyword.toLowerCase(), mode: "insensitive" } },
    ],
  };
}

export async function GET(request: NextRequest) {
  const user = await getAuthorizedUser("brush:manage");
  if (!user) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "20"), 200);
  const search = searchParams.get("search") || "";
  const shopId = searchParams.get("shopId") || "";
  const shopName = searchParams.get("shopName") || "";
  const skip = (page - 1) * pageSize;

  try {
    const searchKeyword = search.trim();
    const andWhere: Prisma.BrushProductWhereInput[] = [];
    if (shopId) {
      andWhere.push({
        OR: [
          { shopProduct: { shopId } },
          { shopProductId: null, shopId },
        ],
      });
    }
    if (shopName) {
      andWhere.push({
        OR: [
          { shopProduct: { shop: { name: shopName } } },
          { shopProductId: null, shop: { name: shopName } },
        ],
      });
    }
    if (searchKeyword) {
      andWhere.push({
        OR: [
          { brushKeyword: { contains: searchKeyword, mode: "insensitive" } },
          { product: buildSearchWhere(search) },
        ],
      });
    }
    const where: Prisma.BrushProductWhereInput = {
      userId: user.id,
      isActive: true,
      ...(andWhere.length > 0 ? { AND: andWhere } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.brushProduct.findMany({
        where,
        include: {
          product: {
            include: {
              supplier: true,
              category: true,
            },
          },
          shop: {
            select: {
              id: true,
              name: true,
            },
          },
          shopProduct: {
            include: {
              shop: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize,
      }),
      prisma.brushProduct.count({ where }),
    ]);

    const storage = await getStorageStrategy();
    const fallbackItems = items.filter((item) => !item.shopProduct);
    const shopIds = Array.from(new Set(fallbackItems.map((item) => item.shopId).filter((value): value is string => Boolean(value))));
    const productIds = Array.from(new Set(fallbackItems.map((item) => item.productId).filter(Boolean)));
    const shopProducts = shopIds.length > 0 && productIds.length > 0
      ? await prisma.shopProduct.findMany({
          where: {
            shop: { userId: user.id },
            shopId: { in: shopIds },
            OR: [
              { productId: { in: productIds } },
              { sourceProductId: { in: productIds } },
            ],
          },
          include: {
            shop: { select: { id: true, name: true } },
          },
        })
      : [];

    const shopProductMap = new Map<string, (typeof shopProducts)[number]>();
    shopProducts.forEach((item) => {
      const keys = [
        item.productId ? `${item.shopId}:${item.productId}` : "",
        item.sourceProductId ? `${item.shopId}:${item.sourceProductId}` : "",
      ].filter(Boolean);
      keys.forEach((key) => {
        if (!shopProductMap.has(key)) {
          shopProductMap.set(key, item);
        }
      });
    });

    const products = items.map((item) => {
      const matchedShopProduct = item.shopProduct || (
        item.shopId
          ? shopProductMap.get(`${item.shopId}:${item.productId}`) || null
          : null
      );
      const resolvedImage = matchedShopProduct?.productImage || item.product.image;

      return {
        ...item.product,
        brushKeyword: item.brushKeyword || "",
        sourceProductId: item.product.id,
        shopId: matchedShopProduct?.shopId || item.shopId || undefined,
        shopName: matchedShopProduct?.shop.name || item.shop?.name || undefined,
        shopProductId: matchedShopProduct?.id || undefined,
        sku: matchedShopProduct?.sku || item.product.sku,
        name: matchedShopProduct?.productName || item.product.name,
        image: resolvedImage ? storage.resolveUrl(resolvedImage) : null,
        remark: matchedShopProduct?.remark || item.product.remark,
        supplierId: matchedShopProduct?.supplierId || item.product.supplierId,
        categoryId: matchedShopProduct?.categoryId || item.product.categoryId,
        costPrice: matchedShopProduct?.costPrice ?? item.product.costPrice,
        stock: matchedShopProduct?.stock ?? item.product.stock,
      };
    });

    products.sort((a, b) => {
      const skuCompare = naturalSortCollator.compare(
        String(a.sku || "").trim(),
        String(b.sku || "").trim()
      );
      if (skuCompare !== 0) {
        return skuCompare;
      }

      const nameCompare = naturalSortCollator.compare(
        String(a.name || "").trim(),
        String(b.name || "").trim()
      );
      if (nameCompare !== 0) {
        return nameCompare;
      }

      const shopCompare = naturalSortCollator.compare(
        String(a.shopName || "").trim(),
        String(b.shopName || "").trim()
      );
      if (shopCompare !== 0) {
        return shopCompare;
      }

      return naturalSortCollator.compare(
        String(a.shopProductId || a.id || "").trim(),
        String(b.shopProductId || b.id || "").trim()
      );
    });

    return NextResponse.json({
      items: products,
      total,
      page,
      pageSize,
      hasMore: skip + items.length < total,
    });
  } catch (error) {
    console.error("Failed to fetch brush product library items:", error);
    return NextResponse.json({ error: "Failed to fetch brush product library items" }, { status: 500 });
  }
}
