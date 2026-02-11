import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getStorageStrategy } from "@/lib/storage";

export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { ids } = await request.json();

    if (!ids || !Array.isArray(ids)) {
      return NextResponse.json({ error: "Invalid item IDs" }, { status: 400 });
    }

    // 获取所有待删除项的 URL
    const items = await prisma.galleryItem.findMany({
      where: {
        id: { in: ids }
      },
      select: { url: true }
    });

    // 执行物理清理
    if (items.length > 0) {
      try {
        const storage = await getStorageStrategy();
        await Promise.allSettled(
          items.map((item: { url: string }) => storage.delete(item.url))
        );
      } catch (storageError) {
        console.error("Batch physical deletion failed:", storageError);
      }
    }

    await prisma.galleryItem.deleteMany({
      where: {
        id: { in: ids }
      }
    });

    return NextResponse.json({ success: true, count: ids.length });
  } catch (error) {
    console.error("Failed to batch delete gallery items:", error);
    return NextResponse.json({ error: "Failed to batch delete gallery items" }, { status: 500 });
  }
}
