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
  } catch (error: any) {
    console.error("Batch delete brush orders failed:", error);
    return NextResponse.json(
      { error: `批量删除失败: ${error.message}` },
      { status: 500 }
    );
  }
}
