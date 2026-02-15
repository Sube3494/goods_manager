import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getStorageStrategy } from "@/lib/storage";
import { hasPermission, SessionUser } from "@/lib/permissions";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession() as SessionUser | null;
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "gallery:delete")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { id } = await params;

    // 先查找记录以获取 URL
    const item = await prisma.galleryItem.findFirst({
      where: { 
        id,
        workspaceId: session.workspaceId
      }
    });

    if (item) {
      // 执行物理删除
      try {
        const storage = await getStorageStrategy();
        await storage.delete(item.url);
      } catch (storageError) {
        console.error("Physical file deletion failed:", storageError);
        // 继续处理数据库删除，即使物理删除失败
      }

      await prisma.galleryItem.delete({
        where: { id }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete gallery item:", error);
    return NextResponse.json({ error: "Failed to delete gallery item" }, { status: 500 });
  }
}
