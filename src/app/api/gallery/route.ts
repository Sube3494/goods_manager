import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { getStorageStrategy } from "@/lib/storage";

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
    const andConditions: Array<Record<string, unknown>> = [];
    
    // Visibility and permission filtering logic
    if (!session || !session.id) {
      // Unauthenticated: only see public products
      andConditions.push({ isPublic: true });
    } else if (session.role !== "SUPER_ADMIN") {
      // Regular user: see own products OR public ones
      andConditions.push({
        OR: [
          { userId: session.id },
          { isPublic: true }
        ]
      });
    }
    // SUPER_ADMIN: no extra visibility filtering

    const productWhere = {
      AND: andConditions,
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
        some: (!session || !session.id) 
          ? { isPublic: true } 
          : (session.role === "SUPER_ADMIN" ? {} : {
              OR: [
                { isPublic: true },
                { userId: session.id }
              ]
            })
      }
    };

    // 2. Get all matching products for natural sort + pagination
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

    // 3. Fetch System Settings for sort direction
    const settings = await prisma.systemSetting.findUnique({ where: { id: "system" } });
    const sortDesc = settings?.gallerySortDesc ?? true;

    // 4. Perform natural sort for products in memory
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

    // 5. Fetch the current page products with only the media needed for summary cards
    const productsData = await prisma.product.findMany({
      where: {
        id: { in: productIds }
      },
      include: {
        category: { select: { name: true } },
        gallery: {
          where: (!session || !session.id) 
            ? { isPublic: true } 
            : (session.role === "SUPER_ADMIN" ? {} : {
                OR: [
                  { isPublic: true },
                  { userId: session.id }
                ]
              }),
          orderBy: [
            { sortOrder: 'asc' },
            { createdAt: 'asc' }
          ]
        }
      }
    });

    // 6. Sort results back to match pagedProducts order
    const sortedProducts = productIds.map(id => productsData.find(p => p.id === id)).filter(Boolean);

    const groups = sortedProducts.map(product => {
      if (!product) return null;

      const resolvedProduct = {
        ...product,
        gallery: undefined,
        image: product.image ? storage.resolveUrl(product.image) : null
      };

      const resolvedGallery = product.gallery.map(item => ({
        ...item,
        url: storage.resolveUrl(item.url),
        thumbnailUrl: item.thumbnailUrl ? storage.resolveUrl(item.thumbnailUrl) : storage.resolveUrl(item.url),
        product: resolvedProduct
      }));

      const mainImageItem = resolvedProduct.image
        ? resolvedGallery.find(item => item.url === resolvedProduct.image)
        : null;
      const coverItem = mainImageItem ||
        resolvedGallery.find(item => item.type !== "video" && !/\.(mp4|mov|webm)$/i.test(item.url)) ||
        resolvedGallery[0] ||
        null;
      const videoCount = resolvedGallery.filter(item => item.type === "video" || /\.(mp4|mov|webm)$/i.test(item.url)).length;
      const imageCount = resolvedGallery.length - videoCount;

      return {
        productId: product.id,
        product: resolvedProduct,
        coverItem,
        totalCount: resolvedGallery.length,
        imageCount,
        videoCount
      };
    }).filter(Boolean);

    return NextResponse.json({
      groups,
      total,
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
    const { url, path, thumbnailUrl, thumbnailPath, urls, productId, tags, isPublic, type } = body;
    const storage = await getStorageStrategy();

    // Handle batch creation if urls array is provided
    if (urls && Array.isArray(urls) && urls.length > 0) {
        const data = urls.map((u: string | { url: string; type?: string }) => ({
            url: storage.stripUrl(typeof u === 'string' ? u : ("path" in u && typeof u.path === "string" ? u.path : u.url)) || "",
            thumbnailUrl: typeof u === 'string'
              ? null
              : ("thumbnailPath" in u && typeof u.thumbnailPath === "string"
                  ? storage.stripUrl(u.thumbnailPath)
                  : ("thumbnailUrl" in u && typeof u.thumbnailUrl === "string" ? storage.stripUrl(u.thumbnailUrl) : null)),
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
        url: storage.stripUrl(path || url) || "", // Ensure url is not undefined if falling back
        thumbnailUrl: storage.stripUrl(thumbnailPath || thumbnailUrl) || null,
        productId,
        tags: tags || [],
        isPublic: isPublic ?? true,
        type: type || "image",
        userId: session.id
      }
    });

    return NextResponse.json({
      ...item,
      url: storage.resolveUrl(item.url),
      thumbnailUrl: item.thumbnailUrl ? storage.resolveUrl(item.thumbnailUrl) : storage.resolveUrl(item.url)
    });
  } catch (error) {
    console.error("Failed to create gallery item:", error);
    return NextResponse.json({ error: "Failed to create gallery item" }, { status: 500 });
  }
}
