import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getStorageStrategy } from "@/lib/storage";

export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    console.log("[Gallery Batch Delete] Session:", JSON.stringify(session));
    
    if (!session) {
      console.error("[Gallery Batch Delete] Unauthorized access attempt");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { ids } = await request.json();
    console.log("[Gallery Batch Delete] Target IDs:", ids);

    if (!ids || !Array.isArray(ids)) {
      console.error("[Gallery Batch Delete] Invalid IDs provided:", ids);
      return NextResponse.json({ error: "Invalid item IDs" }, { status: 400 });
    }

    // 获取所有待删除项的 URL
    const items = await prisma.galleryItem.findMany({
      where: {
        id: { in: ids }
      },
      select: { url: true, id: true }
    });
    
    console.log(`[Gallery Batch Delete] Found ${items.length} of ${ids.length} items in database`);

    // 执行物理清理
    if (items.length > 0) {
      try {
        const storage = await getStorageStrategy();
        console.log("[Gallery Batch Delete] Using storage strategy to clean up files");
        const results = await Promise.allSettled(
          items.map((item: { url: string }) => storage.delete(item.url))
        );
        console.log("[Gallery Batch Delete] Physical deletion results:", JSON.stringify(results));
      } catch (storageError) {
        console.error("[Gallery Batch Delete] Physical deletion failed:", storageError);
      }
    }

    const deleteResult = await prisma.galleryItem.deleteMany({
      where: {
        id: { in: ids }
      }
    });
    
    console.log("[Gallery Batch Delete] Prisma delete result:", deleteResult);

    return NextResponse.json({ success: true, count: deleteResult.count });
  } catch (error) {
    console.error("[Gallery Batch Delete] Fatal error:", error);
    return NextResponse.json({ error: "Failed to batch delete gallery items" }, { status: 500 });
  }
}
