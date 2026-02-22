/*
 * @Date: 2026-02-08 22:12:17
 * @Author: Sube
 * @FilePath: route.ts
 * @LastEditTime: 2026-02-22 23:37:07
 * @Description: 
 */
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
      select: { url: true, id: true }
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

    const deleteResult = await prisma.galleryItem.deleteMany({
      where: {
        id: { in: ids }
      }
    });
    
    return NextResponse.json({ success: true, count: deleteResult.count });
  } catch (error) {
    console.error("Failed to batch delete gallery items:", error);
    return NextResponse.json({ error: "Failed to batch delete gallery items" }, { status: 500 });
  }
}
