import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { SessionUser } from "@/lib/permissions";

// 修改商品库 (名称、公开状态)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const { name, isPublic } = await request.json();

    const updateData: Record<string, any> = {};
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return NextResponse.json({ error: "商品库名称不能为空" }, { status: 400 });
      }
      updateData.name = name.trim();
    }
    if (isPublic !== undefined) {
      updateData.isPublic = Boolean(isPublic);
    }

    const updated = await prisma.productLibrary.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "商品库名称已存在" }, { status: 409 });
    }
    console.error("Failed to update product library:", error);
    return NextResponse.json({ error: "Failed to update library" }, { status: 500 });
  }
}

// 删除商品库 (需满足保护规则)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    // 1. 查找目标库，并验证是否为预置默认库
    const target = await prisma.productLibrary.findUnique({
      where: { id },
    });

    if (!target) {
      return NextResponse.json({ error: "商品库不存在" }, { status: 404 });
    }

    if (target.code === "public" || target.code === "secret") {
      return NextResponse.json({ error: "默认内置商品库禁止删除" }, { status: 400 });
    }

    // 2. 验证库下是否有关联的商品数据
    const productCount = await prisma.product.count({
      where: { libraryId: id },
    });

    if (productCount > 0) {
      return NextResponse.json({
        error: `该商品库下还有 ${productCount} 个商品，请先将商品移至其他库或删除，再执行删除操作。`
      }, { status: 400 });
    }

    // 3. 执行物理删除
    await prisma.productLibrary.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete product library:", error);
    return NextResponse.json({ error: "Failed to delete library" }, { status: 500 });
  }
}
