import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { getStorageStrategy } from "@/lib/storage";
import { Prisma } from "../../../../../prisma/generated-client";

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
  const skip = (page - 1) * pageSize;

  try {
    const searchKeyword = search.trim();
    const where: Prisma.BrushProductWhereInput = {
      userId: user.id,
      isActive: true,
      ...(searchKeyword
        ? {
            OR: [
              { brushKeyword: { contains: searchKeyword, mode: "insensitive" } },
              { product: buildSearchWhere(search) },
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
    const products = items.map((item) => ({
      ...item.product,
      brushKeyword: item.brushKeyword || "",
      image: item.product.image ? storage.resolveUrl(item.product.image) : null,
    }));

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
