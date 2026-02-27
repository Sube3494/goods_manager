import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function DELETE(req: NextRequest) {
  try {
    const { ids } = await req.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "请提供要删除的订单 ID 列表" }, { status: 400 });
    }

    await prisma.brushOrder.deleteMany({
      where: {
        id: { in: ids },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Batch delete brush orders failed:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `批量删除失败: ${errorMessage}` },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { ids, updates } = await req.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "请提供要修改的订单 ID 列表" }, { status: 400 });
    }

    if (!updates || Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "请提供要修改的内容" }, { status: 400 });
    }

    // 只允许更新特定的字段
    const allowedUpdates: Partial<{ commission: number; note: string; type: string }> = {};
    if (updates.commission !== undefined) allowedUpdates.commission = Number(updates.commission);
    if (updates.note !== undefined) allowedUpdates.note = String(updates.note);
    if (updates.type !== undefined) allowedUpdates.type = String(updates.type);

    if (Object.keys(allowedUpdates).length === 0) {
      return NextResponse.json({ error: "没有有效的更新内容" }, { status: 400 });
    }

    const { count } = await prisma.brushOrder.updateMany({
      where: {
        id: { in: ids },
      },
      data: allowedUpdates,
    });

    return NextResponse.json({ success: true, count });
  } catch (error: unknown) {
    console.error("Batch update brush orders failed:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `批量修改失败: ${errorMessage}` }, { status: 500 });
  }
}
