import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { getStorageStrategy } from "@/lib/storage";
import { Prisma } from "../../../../../prisma/generated-client";

const naturalSortCollator = new Intl.Collator("zh-CN", {
  numeric: true,
  sensitivity: "base",
});

function normalizeShopName(value: string | null | undefined) {
  return String(value || "").trim();
}

function stripShopSuffix(value: string) {
  return value.replace(/(门店|店铺|旗舰店|总店|分店|一店|二店|三店|四店|五店|店)$/g, "").trim();
}

function isShopNameMatch(candidate: string | null | undefined, scopedShopName: string | null | undefined) {
  const normalizedCandidate = normalizeShopName(candidate);
  const normalizedScoped = normalizeShopName(scopedShopName);
  if (!normalizedScoped) {
    return true;
  }
  if (!normalizedCandidate) {
    return false;
  }
  if (normalizedCandidate === normalizedScoped) {
    return true;
  }
  if (normalizedCandidate.includes(normalizedScoped) || normalizedScoped.includes(normalizedCandidate)) {
    return true;
  }

  const coreCandidate = stripShopSuffix(normalizedCandidate);
  const coreScoped = stripShopSuffix(normalizedScoped);
  if (!coreCandidate || !coreScoped) {
    return false;
  }

  return (
    coreCandidate === coreScoped ||
    coreCandidate.includes(coreScoped) ||
    coreScoped.includes(coreCandidate)
  );
}

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

    const include = {
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
    } satisfies Prisma.BrushProductInclude;

    const normalizedShopName = normalizeShopName(shopName);
    const shouldFilterByShopName = Boolean(normalizedShopName);

    const [items, total] = shouldFilterByShopName
      ? await Promise.all([
          prisma.brushProduct.findMany({
            where,
            include,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          }),
          prisma.brushProduct.count({ where }),
        ])
      : await Promise.all([
          prisma.brushProduct.findMany({
            where,
            include,
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
        sku: matchedShopProduct?.sku || item.product.sku || item.product.id,
        name: matchedShopProduct?.productName || item.product.name,
        image: resolvedImage ? storage.resolveUrl(resolvedImage) : null,
        remark: matchedShopProduct?.remark || item.product.remark,
        supplierId: matchedShopProduct?.supplierId || item.product.supplierId,
        categoryId: matchedShopProduct?.categoryId || item.product.categoryId,
        costPrice: matchedShopProduct?.costPrice ?? item.product.costPrice,
        stock: matchedShopProduct?.stock ?? item.product.stock,
      };
    });

    const filteredProducts = normalizedShopName
      ? products.filter((product) => isShopNameMatch(product.shopName, normalizedShopName))
      : products;

    filteredProducts.sort((a, b) => {
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

    const paginatedProducts = shouldFilterByShopName
      ? filteredProducts.slice(skip, skip + pageSize)
      : filteredProducts;

    return NextResponse.json({
      items: paginatedProducts,
      total: shouldFilterByShopName ? filteredProducts.length : total,
      page,
      pageSize,
      hasMore: shouldFilterByShopName ? skip + paginatedProducts.length < filteredProducts.length : skip + items.length < total,
    });
  } catch (error) {
    console.error("Failed to fetch brush product library items:", error);
    return NextResponse.json({ error: "Failed to fetch brush product library items" }, { status: 500 });
  }
}
