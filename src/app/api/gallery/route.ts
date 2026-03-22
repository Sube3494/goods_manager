import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { getStorageStrategy } from "@/lib/storage";
import { GalleryItem } from "../../../../prisma/generated-client";

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
    
    // 1. Build product-level filters
    const productWhere = {
      OR: [
        { userId: session?.id || undefined },
        { isPublic: true }
      ],
      id: productId || undefined,
      ...(categoryName && categoryName !== "All" ? { category: { name: categoryName } } : {}),
      ...(query ? {
        AND: [
          {
            OR: [
              { name: { contains: query } },
              { sku: { contains: query } },
              { pinyin: { contains: query } }
            ]
          }
        ]
      } : {}),
      // Only include products that have gallery items matching visibility
      gallery: {
        some: {
          ...(session ? {} : { isPublic: true })
        }
      }
    };

    // 2. Add gallery-specific filters if any (e.g. tags)
    // If tags are provided in query, we might need a more complex nested filter
    // For now, simple query handles it via product fields.

    // 3. Get all matching products for natural sort + pagination
    const allMatchingProducts = await prisma.product.findMany({
      where: productWhere,
      select: {
        id: true,
        sku: true,
        createdAt: true
      }
    });

    const total = allMatchingProducts.length;
    const skip = (page - 1) * pageSize;

    // 4. Fetch System Settings for sort direction
    const settings = await prisma.systemSetting.findUnique({ where: { id: "system" } });
    const sortDesc = settings?.gallerySortDesc ?? true;

    // 5. Perform natural sort for products in memory
    allMatchingProducts.sort((a, b) => {
      const skuA = a.sku || "";
      const skuB = b.sku || "";
      if (sortDesc) {
        return skuB.localeCompare(skuA, undefined, { numeric: true, sensitivity: 'base' });
      } else {
        return skuA.localeCompare(skuB, undefined, { numeric: true, sensitivity: 'base' });
      }
    });

    const pagedProducts = allMatchingProducts.slice(skip, skip + pageSize);
    const productIds = pagedProducts.map(p => p.id);

    const storage = await getStorageStrategy();

    // 5. Fetch full data for these products including their gallery items
    const productsData = await prisma.product.findMany({
      where: {
        id: { in: productIds }
      },
      include: {
        category: { select: { name: true } },
        gallery: {
          where: {
            ...(session ? {} : { isPublic: true })
          },
          orderBy: [
            { sortOrder: 'asc' },
            { createdAt: 'asc' }
          ]
        }
      }
    });

    // 6. Sort results back to match pagedProducts order
    const sortedProducts = productIds.map(id => productsData.find(p => p.id === id)).filter(Boolean);

    // 7. Flatten to "items" structure for frontend compatibility
    const flattenedItems: (GalleryItem & { product: Record<string, unknown> })[] = [];
    sortedProducts.forEach(product => {
      if (!product) return;
      product.gallery.forEach(item => {
        flattenedItems.push({
          ...item,
          url: storage.resolveUrl(item.url),
          product: {
            ...product,
            gallery: undefined, 
            image: product.image ? storage.resolveUrl(product.image) : null
          } as Record<string, unknown>
        });
      });
    });

    return NextResponse.json({
      items: flattenedItems,
      total, // Now total represents product groups
      page,
      pageSize,
      hasMore: skip + pagedProducts.length < total
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
    if (!session || !session.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.role !== "SUPER_ADMIN") {
      const settings = await prisma.systemSetting.findUnique({ where: { id: "system" } });
      if (settings && !settings.allowGalleryUpload) {
        return NextResponse.json({ error: "System upload is currently disabled" }, { status: 403 });
      }

      if (!hasPermission(session, "gallery:upload")) {
        return NextResponse.json({ error: "Permission denied" }, { status: 403 });
      }
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
            userId: session.id
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
        userId: session.id
      }
    });

    const storage = await getStorageStrategy();
    return NextResponse.json({
      ...item,
      url: storage.resolveUrl(item.url)
    });
  } catch (error) {
    console.error("Failed to create gallery item:", error);
    return NextResponse.json({ error: "Failed to create gallery item" }, { status: 500 });
  }
}
