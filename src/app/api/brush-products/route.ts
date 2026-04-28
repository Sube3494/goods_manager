import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { getStorageStrategy } from "@/lib/storage";
import { Prisma } from "../../../../prisma/generated-client";

interface BrushProductsMutationBody {
  productIds?: unknown;
  items?: unknown;
}

interface BrushProductKeywordBody {
  brushProductId?: unknown;
  brushKeyword?: unknown;
}

type BrushProductSelectionItem = {
  productId: string;
  shopId: string | null;
};

function buildProductSearchWhere(search: string): Prisma.ProductWhereInput | undefined {
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

function normalizeBrushSelectionItems(input: unknown): BrushProductSelectionItem[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      const productId = typeof record.productId === "string" ? record.productId.trim() : "";
      const shopId = typeof record.shopId === "string" ? record.shopId.trim() : "";
      if (!productId) {
        return null;
      }
      return {
        productId,
        shopId: shopId || null,
      };
    })
    .filter((item): item is BrushProductSelectionItem => Boolean(item));
}

async function buildBrushProductResponseItems(
  userId: string,
  items: Array<{
    id: string;
    userId: string | null;
    productId: string;
    shopId: string | null;
    isActive: boolean;
    brushKeyword: string | null;
    createdAt: Date;
    updatedAt: Date;
    product: {
      id: string;
      sku: string | null;
      name: string;
      costPrice: number;
      stock: number;
      image: string | null;
      categoryId: string;
      supplierId: string | null;
      createdAt: Date;
      updatedAt: Date;
      isPublic: boolean;
      specs: Prisma.JsonValue | null;
      pinyin: string | null;
      isDiscontinued: boolean;
      isShopOnly: boolean;
      remark: string | null;
      userId: string | null;
      sourceProductId: string | null;
      supplier: {
        id: string;
        code: string | null;
        name: string;
        contact: string | null;
        phone: string | null;
        email: string | null;
        address: string | null;
        createdAt: Date;
        updatedAt: Date;
        userId: string | null;
      } | null;
      category: {
        id: string;
        name: string;
        description: string | null;
        createdAt: Date;
        updatedAt: Date;
        userId: string | null;
      };
    };
    shop: {
      id: string;
      name: string;
    } | null;
  }>
) {
  const storage = await getStorageStrategy();
  const shopIds = Array.from(new Set(items.map((item) => item.shopId).filter((value): value is string => Boolean(value))));
  const productIds = Array.from(new Set(items.map((item) => item.productId).filter(Boolean)));

  const shopProducts = shopIds.length > 0 && productIds.length > 0
    ? await prisma.shopProduct.findMany({
        where: {
          shop: { userId },
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
    const possibleKeys = [
      item.productId ? `${item.shopId}:${item.productId}` : "",
      item.sourceProductId ? `${item.shopId}:${item.sourceProductId}` : "",
    ].filter(Boolean);
    possibleKeys.forEach((key) => {
      if (!shopProductMap.has(key)) {
        shopProductMap.set(key, item);
      }
    });
  });

  return items.map((item) => {
    const matchedShopProduct = item.shopId
      ? shopProductMap.get(`${item.shopId}:${item.productId}`) || null
      : null;
    const resolvedImage = matchedShopProduct?.productImage || item.product.image;

    return {
      ...item,
      shopName: matchedShopProduct?.shop.name || item.shop?.name || null,
      product: {
        ...item.product,
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
      },
    };
  });
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
  const supplierId = searchParams.get("supplierId") || "";
  const shopId = searchParams.get("shopId") || "";
  const skip = (page - 1) * pageSize;

  try {
    const searchKeyword = search.trim();
    const where: Prisma.BrushProductWhereInput = {
      userId: user.id,
      isActive: true,
      ...(shopId ? { shopId } : {}),
      ...(supplierId ? { product: { supplierId } } : {}),
      ...(searchKeyword
        ? {
            OR: [
              { brushKeyword: { contains: searchKeyword, mode: "insensitive" } },
              { product: buildProductSearchWhere(search) },
            ],
          }
        : {}),
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
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize,
      }),
      prisma.brushProduct.count({ where }),
    ]);

    const resolved = await buildBrushProductResponseItems(user.id, items);

    return NextResponse.json({
      items: resolved,
      total,
      page,
      pageSize,
      hasMore: skip + items.length < total,
    });
  } catch (error) {
    console.error("Failed to fetch brush products:", error);
    return NextResponse.json({ error: "Failed to fetch brush products" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthorizedUser("brush:manage");
  if (!user) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const body: BrushProductsMutationBody = await request.json();
    const legacyProductIds = Array.isArray(body.productIds)
      ? body.productIds.filter((id: unknown): id is string => typeof id === "string" && id.trim() !== "")
      : [];
    const selectionItems = normalizeBrushSelectionItems(body.items);
    const normalizedItems = selectionItems.length > 0
      ? selectionItems
      : legacyProductIds.map((productId) => ({ productId, shopId: null }));

    if (normalizedItems.length === 0) {
      return NextResponse.json({ error: "No product items provided" }, { status: 400 });
    }

    const requestedProductIds = Array.from(new Set(normalizedItems.map((item) => item.productId)));
    const ownedProducts = await prisma.product.findMany({
      where: {
        id: { in: requestedProductIds },
        ...(user.role === "SUPER_ADMIN"
          ? {}
          : {
              OR: [
                { userId: user.id },
                { isPublic: true },
              ],
            }),
      },
      select: { id: true },
    });
    const ownedProductIds = new Set(ownedProducts.map((item) => item.id));

    if (ownedProductIds.size === 0) {
      return NextResponse.json({ error: "No valid products found" }, { status: 400 });
    }

    const requestedShopIds = Array.from(new Set(normalizedItems.map((item) => item.shopId).filter((value): value is string => Boolean(value))));
    if (requestedShopIds.length > 0) {
      const ownedShops = await prisma.shop.findMany({
        where: user.role === "SUPER_ADMIN"
          ? { id: { in: requestedShopIds } }
          : { userId: user.id, id: { in: requestedShopIds } },
        select: { id: true },
      });
      const ownedShopIds = new Set(ownedShops.map((item) => item.id));
      const invalidShopId = requestedShopIds.find((id) => !ownedShopIds.has(id));
      if (invalidShopId) {
        return NextResponse.json({ error: "Invalid shop selection" }, { status: 400 });
      }
    }

    const validItems = normalizedItems.filter((item) => ownedProductIds.has(item.productId));
    if (validItems.length === 0) {
      return NextResponse.json({ error: "No valid product items found" }, { status: 400 });
    }

    await prisma.brushProduct.createMany({
      data: validItems.map((item) => ({
        userId: user.id,
        productId: item.productId,
        shopId: item.shopId,
        isActive: true,
        brushKeyword: null,
      })),
      skipDuplicates: true,
    });

    return NextResponse.json({ success: true, count: validItems.length });
  } catch (error) {
    console.error("Failed to add brush products:", error);
    return NextResponse.json({ error: "Failed to add brush products" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthorizedUser("brush:manage");
  if (!user) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const body: BrushProductKeywordBody = await request.json();
    const brushProductId = typeof body.brushProductId === "string" ? body.brushProductId.trim() : "";
    const brushKeyword = typeof body.brushKeyword === "string" ? body.brushKeyword.trim() : "";

    if (!brushProductId) {
      return NextResponse.json({ error: "Brush product ID is required" }, { status: 400 });
    }

    const existing = await prisma.brushProduct.findFirst({
      where: {
        userId: user.id,
        id: brushProductId,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Brush product not found" }, { status: 404 });
    }

    const updated = await prisma.brushProduct.update({
      where: { id: existing.id },
      data: {
        brushKeyword: brushKeyword || null,
      },
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
      },
    });

    const [resolved] = await buildBrushProductResponseItems(user.id, [updated]);
    return NextResponse.json(resolved);
  } catch (error) {
    console.error("Failed to update brush product keyword:", error);
    return NextResponse.json({ error: "Failed to update brush product keyword" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getAuthorizedUser("brush:manage");
  if (!user) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const body: BrushProductsMutationBody = await request.json();
    const brushProductIds = Array.isArray(body.productIds)
      ? body.productIds.filter((id: unknown): id is string => typeof id === "string" && id.trim() !== "")
      : [];

    if (brushProductIds.length === 0) {
      return NextResponse.json({ error: "No product IDs provided" }, { status: 400 });
    }

    const result = await prisma.brushProduct.deleteMany({
      where: {
        userId: user.id,
        id: { in: brushProductIds },
      },
    });

    return NextResponse.json({ success: true, count: result.count });
  } catch (error) {
    console.error("Failed to remove brush products:", error);
    return NextResponse.json({ error: "Failed to remove brush products" }, { status: 500 });
  }
}
