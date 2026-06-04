import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedUser("logistics:manage");
    if (!session) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, code, isActive, sortOrder } = body;

    const existing = await prisma.logisticsCompany.findFirst({
      where: {
        id,
        userId: session.id,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "物流公司不存在" }, { status: 404 });
    }

    if (name && name.trim() !== existing.name) {
      // 检查名称重复
      const duplicate = await prisma.logisticsCompany.findFirst({
        where: {
          userId: session.id,
          name: name.trim(),
          id: { not: id },
        },
      });
      if (duplicate) {
        return NextResponse.json({ error: "该物流公司名称已存在" }, { status: 400 });
      }
    }

    const updated = await prisma.logisticsCompany.update({
      where: { id },
      data: {
        name: name !== undefined ? name.trim() : undefined,
        code: code !== undefined ? (code?.trim() || null) : undefined,
        isActive: isActive !== undefined ? isActive : undefined,
        sortOrder: sortOrder !== undefined ? sortOrder : undefined,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update logistics company:", error);
    return NextResponse.json({ error: "更新物流公司失败" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedUser("logistics:manage");
    if (!session) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { id: idParam } = await params;
    const ids = idParam.split(",");

    const owned = await prisma.logisticsCompany.findMany({
      where: {
        id: { in: ids },
        userId: session.id,
      },
      select: { id: true },
    });

    const ownedIds = owned.map((item) => item.id);

    if (ownedIds.length === 0) {
      return NextResponse.json({ error: "未找到可删除的物流公司" }, { status: 404 });
    }
    if (ownedIds.length !== ids.length) {
      return NextResponse.json({ error: "包含无权操作的物流公司" }, { status: 403 });
    }

    await prisma.logisticsCompany.deleteMany({
      where: {
        id: { in: ownedIds },
        userId: session.id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete logistics companies:", error);
    return NextResponse.json({ error: "删除物流公司失败" }, { status: 500 });
  }
}
