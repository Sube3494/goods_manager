import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthorizedUser("product:read");
    if (!user) {
      return NextResponse.json({ error: "未授权或权限不足" }, { status: 401 });
    }

    const platform = req.nextUrl.searchParams.get("platform") || "meituan";
    const batches = await prisma.meituanImportBatch.findMany({
      where: { userId: user.id, platform },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fileName: true,
        totalCount: true,
        matchedCount: true,
        platform: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ batches });
  } catch (error: any) {
    console.error("获取美团批次列表失败:", error);
    return NextResponse.json({ error: "获取批次列表失败" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthorizedUser("product:read");
    if (!user) {
      return NextResponse.json({ error: "未授权或权限不足" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get("batchId");
    const platform = searchParams.get("platform") || "meituan";

    if (!batchId) {
      return NextResponse.json({ error: "缺少 batchId 参数" }, { status: 400 });
    }

    await prisma.meituanImportBatch.deleteMany({
      where: { id: batchId, userId: user.id, platform },
    });

    return NextResponse.json({ success: true, message: "批次已删除" });
  } catch (error: any) {
    console.error("删除批次失败:", error);
    return NextResponse.json({ error: "删除批次失败" }, { status: 500 });
  }
}
