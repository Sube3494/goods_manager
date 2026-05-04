import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { getStorageStrategy } from "@/lib/storage";
import { Prisma } from "../../../../../../prisma/generated-client";
import { pinyin } from "pinyin-pro";

function generatePinyinSearchText(name: string): string {
  if (!name) return "";
  const fullPinyin = pinyin(name, { toneType: "none", type: "string", v: true }).replace(/\s+/g, "");
  const firstLetters = pinyin(name, { pattern: "first", toneType: "none", type: "string" }).replace(/\s+/g, "");
  return `${fullPinyin} ${firstLetters}`.toLowerCase();
}

function normalizeSku(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function findConflictingShopProductBySku(shopId: string, sku: string, excludeId?: string) {
  return prisma.shopProduct.findFirst({
    where: {
      shopId,
      sku,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      id: true,
      productName: true,
    },
  });
}

async function findConflictingShopProductByJdSkuId(shopId: string, jdSkuId: string, excludeId?: string) {
  return prisma.shopProduct.findFirst({
    where: {
      shopId,
      jdSkuId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      id: true,
      productName: true,
    },
  });
}

async function getOwnedShop(shopId: string, userId: string, isAdmin: boolean) {
  return prisma.shop.findFirst({
    where: isAdmin ? { id: shopId } : { id: shopId, userId },
    select: { id: true, name: true, userId: true },
  });
}

async function ensureUserCategories(userId: string | null | undefined, names: string[]) {
  if (!userId || names.length === 0) {
    return new Map<string, string>();
  }

  const normalizedNames = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
  if (normalizedNames.length === 0) {
    return new Map<string, string>();
  }

  const existing = await prisma.category.findMany({
    where: {
      userId,
      name: { in: normalizedNames },
    },
    select: { id: true, name: true },
  });

  const categoryMap = new Map(existing.map((category) => [category.name, category.id]));
  const missingNames = normalizedNames.filter((name) => !categoryMap.has(name));

  if (missingNames.length > 0) {
    await prisma.category.createMany({
      data: missingNames.map((name) => ({ userId, name })),
      skipDuplicates: true,
    });

    const refreshed = await prisma.category.findMany({
      where: {
        userId,
        name: { in: normalizedNames },
      },
      select: { id: true, name: true },
    });

    return new Map(refreshed.map((category) => [category.name, category.id]));
  }

  return categoryMap;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthorizedUser("product:read");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    }

    const { id: shopId } = await params;
    const shop = await getOwnedShop(shopId, user.id, user.role === "SUPER_ADMIN");
    if (!shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    const search = request.nextUrl.searchParams.get("search") || "";
    const categoryName = request.nextUrl.searchParams.get("categoryName") || "all";
    const supplierId = request.nextUrl.searchParams.get("supplierId") || "all";
    const sortBy = request.nextUrl.searchParams.get("sortBy") || "sku-desc";
    const page = Math.max(1, parseInt(request.nextUrl.searchParams.get("page") || "1", 10));
    const allMode = request.nextUrl.searchParams.get("all") === "true";
    const idsOnly = request.nextUrl.searchParams.get("idsOnly") === "true";
    const pageSize = allMode ? 999999 : Math.min(parseInt(request.nextUrl.searchParams.get("pageSize") || "20", 10), 2000);
    const skip = (page - 1) * pageSize;

    const where = {
      shopId,
      ...(categoryName !== "all" ? { categoryName } : {}),
      ...(supplierId === "unknown" ? { supplierId: null } : supplierId !== "all" ? { supplierId } : {}),
      ...(search
        ? {
            OR: [
              { sku: { contains: search, mode: "insensitive" as const } },
              { jdSkuId: { contains: search, mode: "insensitive" as const } },
              { productName: { contains: search, mode: "insensitive" as const } },
              { pinyin: { contains: search.toLowerCase(), mode: "insensitive" as const } },
              { categoryName: { contains: search, mode: "insensitive" as const } },
              { product: { name: { contains: search, mode: "insensitive" as const } } },
              { product: { pinyin: { contains: search.toLowerCase(), mode: "insensitive" as const } } },
              { product: { category: { name: { contains: search, mode: "insensitive" as const } } } },
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
        return sortBy === "sku-desc"
          ? bVal.localeCompare(aVal, "zh-CN", { numeric: true, sensitivity: "base" })
          : aVal.localeCompare(bVal, "zh-CN", { numeric: true, sensitivity: "base" });
      });

      return allItems;
    };

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
          product: {
            select: {
              id: true,
              name: true,
              image: true,
              categoryId: true,
              supplierId: true,
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
        jdSkuId: item.jdSkuId || null,
        name: item.productName || item.product?.name || "未命名商品",
        image: item.productImage
          ? storage.resolveUrl(item.productImage)
          : item.product?.image
          ? storage.resolveUrl(item.product.image)
          : null,
        categoryId: item.categoryId || item.product?.categoryId || null,
        categoryName: item.categoryName || item.product?.category?.name || "未分类",
        supplierId: item.supplierId || item.product?.supplierId || null,
        costPrice: item.costPrice ?? 0,
        stock: item.stock ?? 0,
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
        orderBy:
          sortBy === "sku-desc" ? { sku: "desc" } :
          sortBy === "createdAt-desc" ? { createdAt: "desc" } :
          sortBy === "createdAt-asc" ? { createdAt: "asc" } :
          sortBy === "stock-desc" ? { stock: "desc" } :
          sortBy === "stock-asc" ? { stock: "asc" } :
          sortBy === "name-asc" ? { productName: "asc" } :
          { sku: "desc" },
      });
      return NextResponse.json({ ids: ids.map((item) => item.id), total: ids.length });
    }

    const [items, total] = await Promise.all([
      prisma.shopProduct.findMany({
        where,
        include: {
          product: {
            select: {
              id: true,
              name: true,
              image: true,
              categoryId: true,
              supplierId: true,
              category: { select: { name: true } },
            },
          },
        },
        orderBy:
          sortBy === "sku-desc" ? { sku: "desc" } :
          sortBy === "createdAt-desc" ? { createdAt: "desc" } :
          sortBy === "createdAt-asc" ? { createdAt: "asc" } :
          sortBy === "stock-desc" ? { stock: "desc" } :
          sortBy === "stock-asc" ? { stock: "asc" } :
          sortBy === "name-asc" ? { productName: "asc" } :
          { sku: "desc" },
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
      jdSkuId: item.jdSkuId || null,
      name: item.productName || item.product?.name || "未命名商品",
      image: item.productImage
        ? storage.resolveUrl(item.productImage)
        : item.product?.image
        ? storage.resolveUrl(item.product.image)
        : null,
      categoryId: item.categoryId || item.product?.categoryId || null,
      categoryName: item.categoryName || item.product?.category?.name || "未分类",
      supplierId: item.supplierId || item.product?.supplierId || null,
      costPrice: item.costPrice ?? 0,
      stock: item.stock ?? 0,
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
    console.error("Failed to fetch shop products:", error);
    return NextResponse.json({ error: "Failed to fetch shop products" }, { status: 500 });
  }
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
    const shop = await getOwnedShop(shopId, user.id, user.role === "SUPER_ADMIN");
    if (!shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    const body = await request.json();
    const itemId = String(body?.id || "").trim();

    if (!itemId) {
      return NextResponse.json({ error: "Missing shop product ID" }, { status: 400 });
    }

    const existing = await prisma.shopProduct.findFirst({
      where: {
        id: itemId,
        shopId,
      },
      select: {
        id: true,
        productId: true,
        sourceProductId: true,
        shopId: true,
        shop: {
          select: {
            userId: true,
          },
        },
        product: {
          select: {
            id: true,
            isShopOnly: true,
            userId: true,
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Shop product not found" }, { status: 404 });
    }

    const productName = String(body?.name || "").trim();
    const normalizedSku = normalizeSku(body?.sku);
    const normalizedJdSkuId = normalizeSku(body?.jdSkuId);
    const categoryId = typeof body?.categoryId === "string" ? body.categoryId.trim() : "";
    const categoryName = String(body?.categoryName || "").trim();
    const productImage = typeof body?.image === "string" ? body.image.trim() : "";
    const supplierId = typeof body?.supplierId === "string" ? body.supplierId.trim() : "";
    const costPrice = Number(body?.costPrice ?? 0);
    const stock = Number(body?.stock ?? 0);
    const isPublic = Boolean(body?.isPublic ?? true);
    const isDiscontinued = Boolean(body?.isDiscontinued ?? false);
    const remark = typeof body?.remark === "string" ? body.remark.trim() : "";
    if (!productName) {
      return NextResponse.json({ error: "商品名称不能为空" }, { status: 400 });
    }

    if (normalizedSku) {
      const conflictingShopProduct = await findConflictingShopProductBySku(shopId, normalizedSku, existing.id);
      if (conflictingShopProduct) {
        return NextResponse.json({
          error: `当前店铺内商品编码 (SKU) "${normalizedSku}" 已存在，请使用其他编码`,
        }, { status: 409 });
      }
    }

    if (normalizedJdSkuId) {
      const conflictingShopProduct = await findConflictingShopProductByJdSkuId(shopId, normalizedJdSkuId, existing.id);
      if (conflictingShopProduct) {
        return NextResponse.json({
          error: `当前店铺内 JD SKU ID "${normalizedJdSkuId}" 已存在，请检查映射商品`,
        }, { status: 409 });
      }
    }

    const storage = await getStorageStrategy();
    const normalizedProductImage = storage.stripUrl(productImage) || null;

    const updated = await prisma.shopProduct.update({
      where: { id: existing.id },
      data: {
        productId: existing.productId || null,
        sourceProductId: existing.sourceProductId || null,
        productName,
        pinyin: generatePinyinSearchText(productName),
        sku: normalizedSku,
        jdSkuId: normalizedJdSkuId,
        categoryId: categoryId || null,
        categoryName: categoryName || "未分类",
        productImage: normalizedProductImage,
        supplierId: supplierId || null,
        costPrice: Number.isFinite(costPrice) ? costPrice : 0,
        stock: Number.isFinite(stock) ? stock : 0,
        isPublic,
        isDiscontinued,
        remark: remark || null,
        specs: Prisma.JsonNull,
      },
      select: {
        id: true,
        productId: true,
        sourceProductId: true,
        sku: true,
        jdSkuId: true,
        productName: true,
        productImage: true,
        categoryId: true,
        categoryName: true,
        supplierId: true,
        costPrice: true,
        stock: true,
        isPublic: true,
        isDiscontinued: true,
        remark: true,
        specs: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      id: updated.id,
      productId: updated.productId || null,
      sourceProductId: updated.sourceProductId,
      sku: updated.sku || null,
      jdSkuId: updated.jdSkuId || null,
      name: updated.productName || "未命名商品",
      image: updated.productImage ? storage.resolveUrl(updated.productImage) : null,
      categoryId: updated.categoryId || null,
      categoryName: updated.categoryName || "未分类",
      supplierId: updated.supplierId || null,
      costPrice: updated.costPrice ?? 0,
      stock: updated.stock ?? 0,
      isPublic: updated.isPublic ?? true,
      isDiscontinued: updated.isDiscontinued ?? false,
      remark: updated.remark || null,
      specs: null,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    console.error("Failed to update shop product:", error);
    return NextResponse.json({ error: "Failed to update shop product" }, { status: 500 });
  }
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
    const productIds = Array.isArray(body?.productIds)
      ? body.productIds.map((item: unknown) => String(item)).filter(Boolean)
      : [];

    if (productIds.length === 0) {
      return NextResponse.json({ error: "Missing product IDs" }, { status: 400 });
    }

    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        isPublic: true,
        isShopOnly: false,
      },
      select: {
        id: true,
        sku: true,
        name: true,
        image: true,
        categoryId: true,
        supplierId: true,
        costPrice: true,
        stock: true,
        isPublic: true,
        isDiscontinued: true,
        remark: true,
        specs: true,
        category: { select: { name: true } },
      },
    });

    if (products.length === 0) {
      return NextResponse.json({ error: "没有可加入店铺的公开商品" }, { status: 404 });
    }

    const existingAssignments = await prisma.shopProduct.findMany({
      where: {
        shopId,
        OR: [
          { productId: { in: products.map((product) => product.id) } },
          { sourceProductId: { in: products.map((product) => product.id) } },
        ],
      },
      select: {
        productId: true,
        sourceProductId: true,
      },
    });
    const existingAssignmentSet = new Set(
      existingAssignments.flatMap((item) => [item.productId, item.sourceProductId]).filter((value): value is string => Boolean(value))
    );

    const categoryMap = await ensureUserCategories(
      shop.userId,
      products.map((product) => product.category?.name || "").filter(Boolean)
    );

    const productsToCreate = products.filter((product) => !existingAssignmentSet.has(product.id));
    const skippedCount = products.length - productsToCreate.length;

    const result = await prisma.shopProduct.createMany({
      data: productsToCreate.map((product) => ({
        shopId,
        productId: product.id,
        sourceProductId: product.id,
        sku: null,
        productName: product.name,
        pinyin: generatePinyinSearchText(product.name),
        productImage: product.image,
        categoryId: categoryMap.get(product.category?.name || "") || null,
        categoryName: product.category?.name || null,
        supplierId: product.supplierId || null,
        costPrice: 0,
        stock: 0,
        isPublic: product.isPublic,
        isDiscontinued: product.isDiscontinued,
        remark: product.remark,
        specs: product.specs ?? Prisma.JsonNull,
      })),
      skipDuplicates: true,
    });

    return NextResponse.json({
      success: true,
      count: result.count,
      skipped: skippedCount,
      message: skippedCount > 0
        ? `成功加入 ${shop.name} ${result.count} 条，跳过 ${skippedCount} 条已复制商品`
        : `成功加入 ${shop.name}`,
    });
  } catch (error) {
    console.error("Failed to assign products to shop:", error);
    return NextResponse.json({ error: "Failed to assign products to shop" }, { status: 500 });
  }
}

export async function PATCH(
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
    const ids = Array.isArray(body?.ids)
      ? body.ids.map((item: unknown) => String(item)).filter(Boolean)
      : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "Missing shop product IDs" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};

    if (typeof body?.categoryId === "string") {
      updateData.categoryId = body.categoryId.trim() || null;
      updateData.categoryName = typeof body?.categoryName === "string" && body.categoryName.trim()
        ? body.categoryName.trim()
        : "未分类";
    }

    if (typeof body?.supplierId === "string") {
      updateData.supplierId = body.supplierId.trim() || null;
    }

    if (body?.costPrice !== undefined) {
      const costPrice = Number(body.costPrice);
      updateData.costPrice = Number.isFinite(costPrice) ? costPrice : 0;
    }

    if (body?.stock !== undefined) {
      const stock = Number(body.stock);
      updateData.stock = Number.isFinite(stock) ? Math.max(0, Math.trunc(stock)) : 0;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const result = await prisma.shopProduct.updateMany({
      where: {
        shopId,
        id: { in: ids },
      },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      count: result.count,
    });
  } catch (error) {
    console.error("Failed to batch update shop products:", error);
    return NextResponse.json({ error: "Failed to batch update shop products" }, { status: 500 });
  }
}

export async function DELETE(
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
    const shopProductIds = Array.isArray(body?.productIds)
      ? body.productIds.map((item: unknown) => String(item)).filter(Boolean)
      : [];

    if (shopProductIds.length === 0) {
      return NextResponse.json({ error: "Missing product IDs" }, { status: 400 });
    }

    const result = await prisma.shopProduct.deleteMany({
      where: {
        shopId,
        id: { in: shopProductIds },
      },
    });

    return NextResponse.json({
      success: true,
      count: result.count,
      message: `已从 ${shop.name} 移出 ${result.count} 个商品`,
    });
  } catch (error) {
    console.error("Failed to remove products from shop:", error);
    return NextResponse.json({ error: "Failed to remove products from shop" }, { status: 500 });
  }
}
