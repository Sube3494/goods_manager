import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";

// 获取相册图片
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query");
    const categoryName = searchParams.get("category");
    const productId = searchParams.get("productId");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");

    const session = await getFreshSession() as SessionUser | null;
    
    // Build efficient where clause
    const productFilter: Record<string, unknown> = {};
    if (categoryName && categoryName !== "All") {
      productFilter.category = { name: categoryName };
    }
    if (!session) {
      productFilter.isPublic = true;
    }

    const where = {
      workspaceId: session?.workspaceId || undefined,
      productId: productId || undefined,
      ...(Object.keys(productFilter).length > 0 ? { product: productFilter } : {}),
      ...(query ? {
        OR: [
          { product: { name: { contains: query } } },
          { product: { sku: { contains: query } } },
          { tags: { has: query } }
        ]
      } : {}),
      // Default to public if no session
      ...(!session ? { isPublic: true } : {})
    };

    const skip = (page - 1) * pageSize;

    // 1. Get total count for pagination metadata
    const total = await prisma.galleryItem.count({ where });

    // 2. Fetch only the needed slice, ordered by creation date
    const items = await prisma.galleryItem.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: [
        { product: { sku: 'asc' } },
        { createdAt: 'desc' }
      ],
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

    return NextResponse.json({
      items,
      total,
      page,
      pageSize,
      hasMore: skip + items.length < total
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
