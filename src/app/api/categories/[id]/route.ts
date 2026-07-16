import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedUser("category:manage");
    if (!session) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const existingCategory = await prisma.category.findFirst({
      where: {
        id,
        userId: session.id,
      },
    });

    if (!existingCategory) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const category = await prisma.category.update({
      where: { id: existingCategory.id },
      data: {
        name: body.name,
        description: body.description,
      },
    });
    return NextResponse.json(category);
  } catch {
    return NextResponse.json({ error: "Failed to update category" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedUser("category:manage");
    if (!session) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { id: idParam } = await params;
    const ids = idParam.split(",");
    const ownedCategories = await prisma.category.findMany({
      where: {
        id: { in: ids },
        userId: session.id,
      },
      select: { id: true },
    });
    const ownedIds = ownedCategories.map((item) => item.id);

    if (ownedIds.length === 0) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
    if (ownedIds.length !== ids.length) {
      return NextResponse.json({ error: "包含无权操作的分类" }, { status: 403 });
    }

    const [productCount, shopProductCount] = await Promise.all([
      prisma.product.count({
        where: {
          categoryId: { in: ownedIds },
          userId: session.id,
        },
      }),
      prisma.shopProduct.count({
        where: {
          categoryId: { in: ownedIds },
          shop: {
            userId: session.id,
          },
        },
      }),
    ]);

    if (productCount > 0 || shopProductCount > 0) {
      return NextResponse.json(
        { error: "无法删除：选中的某些分类下仍有商品。" },
        { status: 400 }
      );
    }

    await prisma.category.deleteMany({
      where: {
        id: { in: ownedIds },
        userId: session.id,
      },
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Bulk delete failed:", error);
    return NextResponse.json({ error: "无法删除：该分类可能正在被商品或其他模块引用。" }, { status: 500 });
  }
}
