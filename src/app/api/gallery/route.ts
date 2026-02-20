import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";

// 获取相册图片
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20"); // Default 20 for gallery view

    const session = await getFreshSession() as SessionUser | null;
    
    const where = {
      ...(productId ? { productId } : {}),
      ...(session ? {
        OR: [
          { workspaceId: session.workspaceId },
          { 
            isPublic: true,
            product: { isPublic: true }
          }
        ]
      } : { 
        isPublic: true,
        product: { isPublic: true }
      }),
    };

    const skip = (page - 1) * pageSize;

    // 1. Fetch all matching IDs and their associated product SKUs
    const allGalleryItems = await prisma.galleryItem.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        product: {
          select: {
            sku: true
          }
        }
      }
    });

    const total = allGalleryItems.length;

    // 2. Perform natural sort by SKU in JavaScript
    allGalleryItems.sort((a, b) => {
      const skuA = a.product?.sku || "";
      const skuB = b.product?.sku || "";
      
      const skuCompare = skuA.localeCompare(skuB, undefined, { numeric: true, sensitivity: 'base' });
      
      if (skuCompare !== 0) {
        return skuCompare;
      }
      
      // Fallback to createdAt desc if SKUs are identical
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // 3. Slice the paginated IDs
    const pageIds = allGalleryItems.slice(skip, skip + pageSize).map(item => item.id);

    // 4. Fetch the detailed paginated items
    const detailedItems = await prisma.galleryItem.findMany({
      where: {
        id: { in: pageIds }
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            image: true,
            stock: true,
            specs: true,
            category: {
              select: {
                name: true
              }
            }
          }
        }
      }
    });
    
    // 5. Restore the sorted order mapping
    const galleryItems = pageIds.map(id => detailedItems.find(item => item.id === id)).filter(Boolean);

    return NextResponse.json({
      items: galleryItems,
      total,
      page,
      pageSize,
      hasMore: skip + galleryItems.length < total
    });
  } catch (error) {
    console.error("Failed to fetch gallery items:", error);
    return NextResponse.json({ error: "Failed to fetch gallery items" }, { status: 500 });
  }
}

// 上传/创建相册图片
export async function POST(request: Request) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "gallery:upload")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const body = await request.json();
    const { url, urls, productId, tags, isPublic, type } = body;

    // Handle batch creation if urls array is provided
    if (urls && Array.isArray(urls) && urls.length > 0) {
        const data = urls.map((u: string | { url: string; type?: string }) => ({
            url: typeof u === 'string' ? u : u.url,
            productId,
            tags: tags || [],
            isPublic: isPublic ?? true,
            type: (typeof u !== 'string' && u.type) ? u.type : "image",
            workspaceId: session.workspaceId // Assign workspaceId
        }));

        const result = await prisma.galleryItem.createMany({
            data
        });
        
        return NextResponse.json({ count: result.count });
    }

    // Fallback to single item creation
    const item = await prisma.galleryItem.create({
      data: {
        url: url || "", // Ensure url is not undefined if falling back
        productId,
        tags: tags || [],
        isPublic: isPublic ?? true,
        type: type || "image",
        workspaceId: session.workspaceId // Assign workspaceId
      }
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error("Failed to create gallery item:", error);
    return NextResponse.json({ error: "Failed to create gallery item" }, { status: 500 });
  }
}
