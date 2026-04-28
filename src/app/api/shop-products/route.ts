import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { getStorageStrategy } from "@/lib/storage";

function buildOrderBy(sortBy: string) {
  if (sortBy === "createdAt-desc") return [{ createdAt: "desc" as const }, { id: "asc" as const }];
  if (sortBy === "createdAt-asc") return [{ createdAt: "asc" as const }, { id: "asc" as const }];
  if (sortBy === "stock-desc") return [{ stock: "desc" as const }, { id: "asc" as const }];
  if (sortBy === "stock-asc") return [{ stock: "asc" as const }, { id: "asc" as const }];
  if (sortBy === "name-asc") return [{ productName: "asc" as const }, { id: "asc" as const }];
  if (sortBy === "shop-asc") return [{ shop: { name: "asc" as const } }, { id: "asc" as const }];
  if (sortBy === "shop-desc") return [{ shop: { name: "desc" as const } }, { id: "asc" as const }];
  if (sortBy === "sku-desc") return [{ sku: "desc" as const }, { id: "asc" as const }];
  return [{ sku: "asc" as const }, { id: "asc" as const }];
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthorizedUser("product:read");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    }

    const search = request.nextUrl.searchParams.get("search") || "";
    const categoryName = request.nextUrl.searchParams.get("categoryName") || "all";
    const supplierId = request.nextUrl.searchParams.get("supplierId") || "all";
    const shopId = request.nextUrl.searchParams.get("shopId") || "all";
    const scope = request.nextUrl.searchParams.get("scope");
    const sortBy = request.nextUrl.searchParams.get("sortBy") || "sku-asc";
    const idsParam = request.nextUrl.searchParams.get("ids") || "";
    const explicitIds = idsParam.split(",").map((id) => id.trim()).filter(Boolean);
    const page = Math.max(1, parseInt(request.nextUrl.searchParams.get("page") || "1", 10));
    const allMode = request.nextUrl.searchParams.get("all") === "true";
    const idsOnly = request.nextUrl.searchParams.get("idsOnly") === "true";
    const pageSize = allMode ? 999999 : Math.min(parseInt(request.nextUrl.searchParams.get("pageSize") || "20", 10), 2000);
    const skip = (page - 1) * pageSize;

    const canViewAllShops = user.role === "SUPER_ADMIN" && scope === "all";

    const where = {
      ...(canViewAllShops ? {} : { shop: { userId: user.id } }),
      ...(explicitIds.length > 0 ? { id: { in: explicitIds } } : {}),
      ...(shopId !== "all" ? { shopId } : {}),
      ...(categoryName !== "all" ? { categoryName } : {}),
      ...(supplierId === "unknown" ? { supplierId: null } : supplierId !== "all" ? { supplierId } : {}),
      ...(search
        ? {
            OR: [
              { sku: { contains: search, mode: "insensitive" as const } },
              { productName: { contains: search, mode: "insensitive" as const } },
              { pinyin: { contains: search.toLowerCase(), mode: "insensitive" as const } },
              { categoryName: { contains: search, mode: "insensitive" as const } },
              { shop: { name: { contains: search, mode: "insensitive" as const } } },
              { product: { name: { contains: search, mode: "insensitive" as const } } },
              { product: { pinyin: { contains: search.toLowerCase(), mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };

    const naturalSortBySku = async () => {
      const allItems = await prisma.shopProduct.findMany({
        where,
        select: {
          id: true,
          sku: true,
        },
      });

      allItems.sort((a, b) => {
        const aVal = a.sku || "";
        const bVal = b.sku || "";
        const compareResult =
          sortBy === "sku-desc"
            ? bVal.localeCompare(aVal, "zh-CN", { numeric: true, sensitivity: "base" })
            : aVal.localeCompare(bVal, "zh-CN", { numeric: true, sensitivity: "base" });

        if (compareResult !== 0) return compareResult;
        return a.id.localeCompare(b.id, "en");
      });

      return allItems;
    };

    if (explicitIds.length > 0 && !idsOnly) {
      const storage = await getStorageStrategy();

      if (sortBy === "sku-asc" || sortBy === "sku-desc") {
        const sortedItems = await naturalSortBySku();
        const selectedIds = sortedItems.map((item) => item.id);
        const selectedItems = await prisma.shopProduct.findMany({
          where: {
            id: { in: selectedIds },
          },
          include: {
            shop: {
              select: {
                id: true,
                name: true,
              },
            },
            product: {
              select: {
                id: true,
                name: true,
                image: true,
                categoryId: true,
                supplierId: true,
                supplier: { select: { id: true, name: true } },
                category: { select: { name: true } },
              },
            },
          },
        });

        const orderedItems = selectedIds
          .map((id) => selectedItems.find((item) => item.id === id))
          .filter((item): item is NonNullable<typeof item> => Boolean(item));

        return NextResponse.json({
          items: orderedItems.map((item) => ({
            id: item.id,
            sourceProductId: item.sourceProductId || item.productId || item.id,
            productId: item.productId || null,
            sku: item.sku || null,
            name: item.productName || item.product?.name || "未命名商品",
            image: item.productImage
              ? storage.resolveUrl(item.productImage)
              : item.product?.image
              ? storage.resolveUrl(item.product.image)
              : null,
            categoryId: item.categoryId || item.product?.categoryId || null,
            categoryName: item.categoryName || item.product?.category?.name || "未分类",
            supplierId: item.supplierId || item.product?.supplierId || null,
            supplier: item.product?.supplier
              ? { id: item.product.supplier.id, name: item.product.supplier.name }
              : null,
            costPrice: item.costPrice ?? 0,
            stock: item.stock ?? 0,
            shopId: item.shopId,
            shopName: item.shop?.name || "",
            isPublic: item.isPublic ?? true,
            isDiscontinued: item.isDiscontinued ?? false,
            sourceType: "shopProduct" as const,
            shopProductId: item.id,
            isStandaloneShopProduct: !item.productId,
            remark: item.remark || null,
            specs: item.specs ?? null,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          })),
          total: orderedItems.length,
          page: 1,
          pageSize: orderedItems.length,
          hasMore: false,
        });
      }

      const selectedItems = await prisma.shopProduct.findMany({
        where,
        include: {
          shop: {
            select: {
              id: true,
              name: true,
            },
          },
          product: {
            select: {
              id: true,
              name: true,
              image: true,
              categoryId: true,
              supplierId: true,
              supplier: { select: { id: true, name: true } },
              category: { select: { name: true } },
            },
          },
        },
        orderBy: buildOrderBy(sortBy),
      });

      return NextResponse.json({
        items: selectedItems.map((item) => ({
          id: item.id,
          sourceProductId: item.sourceProductId || item.productId || item.id,
          productId: item.productId || null,
          sku: item.sku || null,
          name: item.productName || item.product?.name || "未命名商品",
          image: item.productImage
            ? storage.resolveUrl(item.productImage)
            : item.product?.image
            ? storage.resolveUrl(item.product.image)
            : null,
          categoryId: item.categoryId || item.product?.categoryId || null,
          categoryName: item.categoryName || item.product?.category?.name || "未分类",
          supplierId: item.supplierId || item.product?.supplierId || null,
          supplier: item.product?.supplier
            ? { id: item.product.supplier.id, name: item.product.supplier.name }
            : null,
          costPrice: item.costPrice ?? 0,
          stock: item.stock ?? 0,
          shopId: item.shopId,
          shopName: item.shop?.name || "",
          isPublic: item.isPublic ?? true,
          isDiscontinued: item.isDiscontinued ?? false,
          sourceType: "shopProduct" as const,
          shopProductId: item.id,
          isStandaloneShopProduct: !item.productId,
          remark: item.remark || null,
          specs: item.specs ?? null,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        })),
        total: selectedItems.length,
        page: 1,
        pageSize: selectedItems.length,
        hasMore: false,
      });
    }

    if (sortBy === "sku-asc" || sortBy === "sku-desc") {
      const sortedItems = await naturalSortBySku();

      if (idsOnly) {
        return NextResponse.json({ ids: sortedItems.map((item) => item.id), total: sortedItems.length });
      }

      const pageIds = sortedItems.slice(skip, skip + pageSize).map((item) => item.id);
      const pagedItems = await prisma.shopProduct.findMany({
        where: {
          id: { in: pageIds },
        },
        include: {
          shop: {
            select: {
              id: true,
              name: true,
            },
          },
          product: {
            select: {
              id: true,
              name: true,
              image: true,
              categoryId: true,
              supplierId: true,
              supplier: { select: { id: true, name: true } },
              category: { select: { name: true } },
            },
          },
        },
      });

      const orderedItems = pageIds
        .map((id) => pagedItems.find((item) => item.id === id))
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

      const storage = await getStorageStrategy();
      const resolved = orderedItems.map((item) => ({
        id: item.id,
        sourceProductId: item.sourceProductId || item.productId || item.id,
        productId: item.productId || null,
        sku: item.sku || null,
        name: item.productName || item.product?.name || "未命名商品",
        image: item.productImage
          ? storage.resolveUrl(item.productImage)
          : item.product?.image
          ? storage.resolveUrl(item.product.image)
          : null,
        categoryId: item.categoryId || item.product?.categoryId || null,
        categoryName: item.categoryName || item.product?.category?.name || "未分类",
        supplierId: item.supplierId || item.product?.supplierId || null,
        supplier: item.product?.supplier
          ? { id: item.product.supplier.id, name: item.product.supplier.name }
          : null,
        costPrice: item.costPrice ?? 0,
        stock: item.stock ?? 0,
        shopId: item.shopId,
        shopName: item.shop?.name || "",
        isPublic: item.isPublic ?? true,
        isDiscontinued: item.isDiscontinued ?? false,
        sourceType: "shopProduct" as const,
        shopProductId: item.id,
        isStandaloneShopProduct: !item.productId,
        remark: item.remark || null,
        specs: item.specs ?? null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));

      return NextResponse.json({
        items: resolved,
        total: sortedItems.length,
        page,
        pageSize,
        hasMore: page * pageSize < sortedItems.length,
      });
    }

    if (idsOnly) {
      const ids = await prisma.shopProduct.findMany({
        where,
        select: { id: true },
        orderBy: buildOrderBy(sortBy),
      });

      return NextResponse.json({ ids: ids.map((item) => item.id), total: ids.length });
    }

    const [items, total] = await Promise.all([
      prisma.shopProduct.findMany({
        where,
        include: {
          shop: {
            select: {
              id: true,
              name: true,
            },
          },
          product: {
            select: {
              id: true,
              name: true,
              image: true,
              categoryId: true,
              supplierId: true,
              supplier: { select: { id: true, name: true } },
              category: { select: { name: true } },
            },
          },
        },
        orderBy: buildOrderBy(sortBy),
        skip,
        take: pageSize,
      }),
      prisma.shopProduct.count({ where }),
    ]);

    const storage = await getStorageStrategy();
    const resolved = items.map((item) => ({
      id: item.id,
      sourceProductId: item.sourceProductId || item.productId || item.id,
      productId: item.productId || null,
      sku: item.sku || null,
      name: item.productName || item.product?.name || "未命名商品",
      image: item.productImage
        ? storage.resolveUrl(item.productImage)
        : item.product?.image
        ? storage.resolveUrl(item.product.image)
        : null,
      categoryId: item.categoryId || item.product?.categoryId || null,
      categoryName: item.categoryName || item.product?.category?.name || "未分类",
      supplierId: item.supplierId || item.product?.supplierId || null,
      supplier: item.product?.supplier
        ? { id: item.product.supplier.id, name: item.product.supplier.name }
        : null,
      costPrice: item.costPrice ?? 0,
      stock: item.stock ?? 0,
      shopId: item.shopId,
      shopName: item.shop?.name || "",
      isPublic: item.isPublic ?? true,
      isDiscontinued: item.isDiscontinued ?? false,
      sourceType: "shopProduct" as const,
      shopProductId: item.id,
      isStandaloneShopProduct: !item.productId,
      remark: item.remark || null,
      specs: item.specs ?? null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    return NextResponse.json({
      items: resolved,
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    });
  } catch (error) {
    console.error("Failed to fetch aggregated shop products:", error);
    return NextResponse.json({ error: "Failed to fetch shop products" }, { status: 500 });
  }
}
