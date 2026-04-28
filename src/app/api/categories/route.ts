import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";

const HIDDEN_CATEGORY_NAMES = ["历史残留"];
const HIDDEN_CATEGORY_DESCRIPTION = "系统历史残留商品归档";

export async function GET(request: Request) {
  const session = await getFreshSession() as SessionUser | null;
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") || "all";
  const mainProductsOnly = scope === "main-products";

  try {
    const categories = await prisma.category.findMany({
      where: session ? {
        userId: session.id,
        name: { notIn: HIDDEN_CATEGORY_NAMES },
        description: { not: HIDDEN_CATEGORY_DESCRIPTION },
      } : {},
      select: {
        id: true,
        name: true,
        description: true,
      },
      orderBy: { name: 'asc' }
    });

    const [products, shopProducts] = await Promise.all([
      prisma.product.findMany({
        where: session ? {
          userId: session.id,
          ...(mainProductsOnly ? { isShopOnly: false } : {}),
        } : {
          isPublic: true,
          isShopOnly: false,
        },
        select: {
          categoryId: true,
        },
      }),
      session
        ? prisma.shopProduct.findMany({
            where: {
              shop: {
                userId: session.id,
              },
            },
            select: {
              categoryId: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const countMap = new Map<string, number>();
    for (const product of products) {
      if (!product.categoryId) continue;
      const current = countMap.get(product.categoryId) || 0;
      countMap.set(product.categoryId, current + 1);
    }
    for (const product of shopProducts) {
      if (!product.categoryId) continue;
      const current = countMap.get(product.categoryId) || 0;
      countMap.set(product.categoryId, current + 1);
    }
    
    // 映射回前端需要的结构
    const formatted = categories.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description || "",
      count: countMap.get(c.id) || 0,
    }))
      .filter((category) => !mainProductsOnly || category.count > 0);

    return NextResponse.json(formatted);
  } catch (error) {
    console.error("Failed to fetch categories:", error);
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "category:manage")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const body = await request.json();
    const category = await prisma.category.create({
      data: {
        name: body.name,
        description: body.description,
        userId: session.id,
      }
    });
    return NextResponse.json(category);
  } catch (error) {
    console.error("Failed to create category:", error);
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}
