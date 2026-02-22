/*
 * @Date: 2026-02-08 22:12:17
 * @Author: Sube
 * @FilePath: route.ts
 * @LastEditTime: 2026-02-22 23:37:07
 * @Description: 
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { getStorageStrategy } from "@/lib/storage";

export async function DELETE(request: Request) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "gallery:delete")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
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

    // 清除引用了这些URL为封面的商品信息，防止幽灵缓存
    const urls = items.map((item: { url: string }) => item.url);
    if (urls.length > 0) {
      await prisma.product.updateMany({
        where: { image: { in: urls } },
        data: { image: null }
      });
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
