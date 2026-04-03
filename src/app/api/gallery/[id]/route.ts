/*
 * @Date: 2026-02-07 17:29:57
 * @Author: Sube
 * @FilePath: route.ts
 * @LastEditTime: 2026-03-03 15:41:23
 * @Description: 
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { getStorageStrategy } from "@/lib/storage";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "gallery:upload")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { isPublic, url: newUrl, path: newPath, thumbnailUrl: newThumbnailUrl, thumbnailPath: newThumbnailPath } = body;
    const storage = await getStorageStrategy();
    const normalizedUrl = storage.stripUrl(newPath || newUrl);
    const normalizedThumbnailUrl = storage.stripUrl(newThumbnailPath || newThumbnailUrl);

    // 获取旧数据用于清理文件
    const oldItem = await prisma.galleryItem.findUnique({
      where: { id },
      select: { url: true, thumbnailUrl: true }
    });

    const updated = await prisma.galleryItem.update({
      where: { id },
      data: { 
        ...(isPublic !== undefined ? { isPublic } : {}),
        ...(normalizedUrl ? { url: normalizedUrl } : {}),
        ...(newThumbnailUrl !== undefined || newThumbnailPath !== undefined ? { thumbnailUrl: normalizedThumbnailUrl || null } : {})
      },
    });

    // 如果 URL 发生了变化，清理旧物理文件
    if (normalizedUrl && oldItem && oldItem.url !== normalizedUrl) {
      try {
        // 检查是否有其他记录仍在使用该旧 URL
        const refCount = await prisma.galleryItem.count({
          where: { url: oldItem.url }
        });
        
        if (refCount === 0) {
          await storage.delete(oldItem.url);
        }
      } catch (storageError) {
        console.error("Failed to cleanup old file after rotation:", storageError);
      }
    }

    if ((newThumbnailUrl !== undefined || newThumbnailPath !== undefined) && oldItem?.thumbnailUrl && oldItem.thumbnailUrl !== normalizedThumbnailUrl) {
      try {
        const thumbnailRefCount = await prisma.galleryItem.count({
          where: { thumbnailUrl: oldItem.thumbnailUrl }
        });

        if (thumbnailRefCount === 0) {
          await storage.delete(oldItem.thumbnailUrl);
        }
      } catch (storageError) {
        console.error("Failed to cleanup old thumbnail after update:", storageError);
      }
    }

    return NextResponse.json({
      ...updated,
      url: storage.resolveUrl(updated.url),
      thumbnailUrl: updated.thumbnailUrl ? storage.resolveUrl(updated.thumbnailUrl) : storage.resolveUrl(updated.url)
    });
  } catch (error) {
    console.error("Failed to update gallery item:", error);
    return NextResponse.json({ error: "Failed to update gallery item" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { id } = await params;

    const item = await prisma.galleryItem.findUnique({
      where: { id },
      select: { url: true, thumbnailUrl: true }
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // 计算该 URL 的引用数（有多少 GalleryItem 指向同一物理文件）
    const refCount = await prisma.galleryItem.count({
      where: { url: item.url }
    });

    // 先清除商品封面引用，再删数据库记录
    await prisma.product.updateMany({
      where: { image: item.url },
      data: { image: null }
    });

    await prisma.galleryItem.delete({
      where: { id }
    });

    // 只有最后一个引用被删除时，才物理删除文件
    if (refCount <= 1) {
      try {
        const storage = await getStorageStrategy();
        await storage.delete(item.url);
        if (item.thumbnailUrl) {
          const thumbnailRefCount = await prisma.galleryItem.count({
            where: { thumbnailUrl: item.thumbnailUrl }
          });
          if (thumbnailRefCount === 0) {
            await storage.delete(item.thumbnailUrl);
          }
        }
      } catch (storageError) {
        console.error("Failed to delete physical file:", storageError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete gallery item:", error);
    return NextResponse.json({ error: "Failed to delete gallery item" }, { status: 500 });
  }
}
