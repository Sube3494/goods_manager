import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession() as SessionUser | null;
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "category:manage")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const category = await prisma.category.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,

      }
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
    const session = await getSession() as SessionUser | null;
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "category:manage")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { id: idParam } = await params;
    
    // 支持逗号分隔的批量 ID
    const ids = idParam.split(",");

    // 检查是否有任何分类下仍有商品 (Check if any category has products)
    const productCount = await prisma.product.count({
      where: {
        categoryId: { in: ids }
      }
    });

    if (productCount > 0) {
      return NextResponse.json(
        { error: "无法删除：选中的某些分类下仍有商品。" },
        { status: 400 }
      );
    }

    await prisma.category.deleteMany({
      where: {
        id: { in: ids }
      }
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Bulk delete failed:", error);
    return NextResponse.json({ error: "无法删除：该分类可能正在被商品或其他模块引用。" }, { status: 500 });
  }
}
