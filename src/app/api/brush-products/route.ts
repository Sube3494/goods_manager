import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { getStorageStrategy } from "@/lib/storage";
import { Prisma } from "../../../../prisma/generated-client";

interface BrushProductsMutationBody {
  productIds?: unknown;
}

interface BrushProductKeywordBody {
  productId?: unknown;
  brushKeyword?: unknown;
}

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
  const skip = (page - 1) * pageSize;

  try {
    const searchKeyword = search.trim();
    const where: Prisma.BrushProductWhereInput = {
      userId: user.id,
      isActive: true,
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
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.brushProduct.count({ where }),
    ]);

    const storage = await getStorageStrategy();
    const resolved = items.map((item) => ({
      ...item,
      brushKeyword: item.brushKeyword,
      product: {
        ...item.product,
        image: item.product.image ? storage.resolveUrl(item.product.image) : null,
      },
    }));

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
    const productIds = Array.isArray(body.productIds)
      ? body.productIds.filter((id: unknown): id is string => typeof id === "string" && id.trim() !== "")
      : [];

    if (productIds.length === 0) {
      return NextResponse.json({ error: "No product IDs provided" }, { status: 400 });
    }

    const ownedProducts = await prisma.product.findMany({
      where: {
        id: { in: productIds },
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
    const ownedIds = ownedProducts.map((item) => item.id);

    if (ownedIds.length === 0) {
      return NextResponse.json({ error: "No valid products found" }, { status: 400 });
    }

    await prisma.brushProduct.createMany({
      data: ownedProducts.map((product) => ({
        userId: user.id,
        productId: product.id,
        isActive: true,
        brushKeyword: null,
      })),
      skipDuplicates: true,
    });

    return NextResponse.json({ success: true, count: ownedIds.length });
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
    const productId = typeof body.productId === "string" ? body.productId.trim() : "";
    const brushKeyword = typeof body.brushKeyword === "string" ? body.brushKeyword.trim() : "";

    if (!productId) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    const existing = await prisma.brushProduct.findFirst({
      where: {
        userId: user.id,
        productId,
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
      },
    });

    const storage = await getStorageStrategy();
    return NextResponse.json({
      ...updated,
      brushKeyword: updated.brushKeyword,
      product: {
        ...updated.product,
        image: updated.product.image ? storage.resolveUrl(updated.product.image) : null,
      },
    });
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
    const productIds = Array.isArray(body.productIds)
      ? body.productIds.filter((id: unknown): id is string => typeof id === "string" && id.trim() !== "")
      : [];

    if (productIds.length === 0) {
      return NextResponse.json({ error: "No product IDs provided" }, { status: 400 });
    }

    const result = await prisma.brushProduct.deleteMany({
      where: {
        userId: user.id,
        productId: { in: productIds },
      },
    });

    return NextResponse.json({ success: true, count: result.count });
  } catch (error) {
    console.error("Failed to remove brush products:", error);
    return NextResponse.json({ error: "Failed to remove brush products" }, { status: 500 });
  }
}
