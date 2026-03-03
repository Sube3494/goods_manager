import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { pinyin } from "pinyin-pro";
import { getStorageStrategy } from "@/lib/storage";
import { getLightSession, getCachedSettings, getAuthorizedUser } from "@/lib/auth";

// ProductWithRelations and ProductWhereInput removed as unused or redundant with internal Prisma types

function generatePinyinSearchText(name: string): string {
  if (!name) return "";
  const fullPinyin = pinyin(name, { toneType: 'none', type: 'string', v: true }).replace(/\s+/g, '');
  const firstLetters = pinyin(name, { pattern: 'first', toneType: 'none', type: 'string' }).replace(/\s+/g, '');
  return `${fullPinyin} ${firstLetters}`.toLowerCase();
}

// 获取所有商品 (支持分页、筛选、排序)
export async function GET(request: Request) {
  try {
    // Optimization: Use light session (no DB hit)
    const session = await getLightSession();
    
    // Optimization: Use cached settings
    const settings = await getCachedSettings();
    const lowStockThreshold = settings?.lowStockThreshold || 10;
    
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const allMode = searchParams.get("all") === "true";
    const pageSize = allMode ? 999999 : Math.min(parseInt(searchParams.get("pageSize") || "20"), 2000);

    const search = searchParams.get("search") || "";
    const categoryName = searchParams.get("category") || "all";
    const status = searchParams.get("status") || "all";
    const sortByParam = searchParams.get("sortBy") || "sku-asc";
    const idsOnly = searchParams.get("idsOnly") === "true";
    const supplierId = searchParams.get("supplierId") || "all";

    const [field, order] = sortByParam.split("-") as [string, "asc" | "desc"];

    // 构建查询条件
    const andConditions: Array<Record<string, unknown>> = [];
    if (session?.id) {
      andConditions.push({
        OR: [
          { userId: session.id },
          { isPublic: true }
        ]
      });
    }

    if (search) {
      andConditions.push({
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { sku: { contains: search, mode: "insensitive" } },
          { category: { name: { contains: search, mode: "insensitive" } } },
          { pinyin: { contains: search, mode: "insensitive" } }
        ]
      });
    }

    if (categoryName !== "all") andConditions.push({ category: { name: categoryName } });
    if (supplierId !== "all") andConditions.push({ supplierId: supplierId });

    if (status === "low_stock") {
      andConditions.push({ stock: { lt: lowStockThreshold } });
    } else if (status === "public") {
      andConditions.push({ isPublic: true });
    } else if (status === "private") {
      andConditions.push({ isPublic: false });
    } else if (status === "discontinued") {
      andConditions.push({ isDiscontinued: true });
    }

    const where = andConditions.length > 0 ? { AND: andConditions } : {};
    const skip = (page - 1) * pageSize;

    // Build standard orderBy
    const standardOrderBy: Record<string, string>[] = field === "sku" ? [{ sku: order }] : 
                                  field === "stock" ? [{ stock: order }] :
                                  field === "name" ? [{ name: order }] :
                                  [{ createdAt: order }];

    // Handle Natural Sort for SKU with performance consideration
    if (field === "sku") {
        const totalCount = await prisma.product.count({ where });
        
        // PERFORMANCE SAFEGUARD: 
        // Only perform in-memory natural sort if result set is manageable (e.g. < 500)
        // For larger datasets, fallback to standard DB sorted pagination to prevent OOM
        if (totalCount < 500) {
            const allItems = await prisma.product.findMany({
              where,
              select: { id: true, sku: true },
            });

            allItems.sort((a, b) => {
              const aVal = a.sku || "";
              const bVal = b.sku || "";
              return order === 'asc' 
                ? aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' })
                : bVal.localeCompare(aVal, undefined, { numeric: true, sensitivity: 'base' });
            });

            if (idsOnly) return NextResponse.json({ ids: allItems.map(p => p.id), total: totalCount });

            const pageIds = allItems.slice(skip, skip + pageSize).map(p => p.id);
            const detailedProducts = await prisma.product.findMany({
              where: { id: { in: pageIds } },
              include: { category: true, supplier: true, gallery: { take: 1 } }, // Optimization: Only 1 gallery img for list
            });

            const sortedProducts = pageIds.map(id => detailedProducts.find(d => d.id === id)).filter(Boolean);
            return formatResponse(sortedProducts, totalCount, page, pageSize);
        }
    }

    // Standard Database Pagination (Fastest)
    if (idsOnly) {
      const allIds = await prisma.product.findMany({ where, select: { id: true }, orderBy: standardOrderBy });
      return NextResponse.json({ ids: allIds.map(p => p.id), total: allIds.length });
    }

    const [pData, pTotal] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { category: true, supplier: true, gallery: { take: 1 } },
        orderBy: standardOrderBy,
        skip,
        take: pageSize,
      }),
      prisma.product.count({ where })
    ]);

    return formatResponse(pData, pTotal, page, pageSize);
  } catch (error) {
    console.error("Failed to fetch products:", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}

async function formatResponse(products: unknown[], total: number, page: number, pageSize: number) {
  const { getStorageStrategy } = await import("@/lib/storage");
  const storage = await getStorageStrategy();
  
  const resolved = (products as Record<string, unknown>[]).map(p => ({
    ...p,
    image: p.image ? storage.resolveUrl(p.image as string) : null,
    gallery: (p.gallery as Array<{ url: string }>)?.map((img) => ({ ...img, url: storage.resolveUrl(img.url) })) || []
  }));

  return NextResponse.json({
    items: resolved,
    total,
    page,
    pageSize,
    hasMore: (page * pageSize) < total,
  });
}


// 创建新商品
export async function POST(request: Request) {
  try {
    const user = await getAuthorizedUser("product:create");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    }

    const body = await request.json();
    const { name, sku, costPrice, stock, categoryId, supplierId, image, isPublic, isDiscontinued, specs, remark } = body;

    const stockNum = Number(stock) || 0;

    const product = await prisma.product.create({
      data: {
        name,
        sku: sku?.trim() || null,
        costPrice: Number(costPrice) || 0,
        stock: stockNum,
        categoryId: categoryId || undefined,
        supplierId: supplierId || null,
        image,
        pinyin: generatePinyinSearchText(name),
        isPublic: isPublic ?? true,
        isDiscontinued: isDiscontinued ?? false,
        specs: specs !== undefined ? (Object.keys(specs || {}).length > 0 ? specs : null) : undefined,
        remark: remark || null,
        userId: user.id,
      },
      include: {
        category: true,
        supplier: true,
      }
    });

    // 如果初始库存大于 0，自动生成一张“已入库”状态的采购单作为凭证
    if (stockNum > 0) {
      const orderId = `PO-INIT-${Date.now().toString().slice(-6)}`;
      await prisma.purchaseOrder.create({
        data: {
          id: orderId,
          type: "Inbound",
          status: "Received",
          totalAmount: 0,
          date: new Date(),
          userId: user.id,
          items: {
            create: [{
              productId: product.id,
              supplierId: supplierId || null,
              quantity: stockNum,
              costPrice: 0
            }]
          }
        }
      });
    }

    const storage = await getStorageStrategy();
    return NextResponse.json({
      ...product,
      image: product.image ? storage.resolveUrl(product.image) : null
    });
  } catch (error: unknown) {
    // Handle Prisma Foreign Key Constraint Violated error
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2003') {
      return NextResponse.json({ 
        error: "无效的分类或供应商 ID，请检查关联选项" 
      }, { status: 400 });
    }

    // Handle Prisma Unique Constraint Violated error (SKU already exists)
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return NextResponse.json({ 
        error: "商品编码 (SKU) 已存在，请使用其他编码" 
      }, { status: 400 });
    }

    console.error("Failed to create product:", error);

    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}

// 更新商品
export async function PUT(request: Request) {
  try {
    const user = await getAuthorizedUser("product:update");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    }

    const body = await request.json();
    const { id, name, sku, costPrice, stock, categoryId, supplierId, image, isPublic, isDiscontinued, specs, remark } = body;

    if (!id) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    const existing = await prisma.product.findFirst({
      where: { id, userId: user.id }
    });

    if (!existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const updatedProduct = await prisma.product.update({
      where: { id },
      data: {
        name,
        sku: sku?.trim() || null,
        costPrice: costPrice !== undefined ? Math.max(0, Number(costPrice) || 0) : undefined,
        stock: Number(stock) || 0,
        categoryId: categoryId || undefined,
        supplierId: supplierId || null,
        image,
        pinyin: name ? generatePinyinSearchText(name) : undefined,
        isPublic: isPublic ?? undefined,
        isDiscontinued: isDiscontinued ?? undefined,
        // Using Prisma Json values correctly. If specs is explicitly sent (even empty object), save it. 
        // If undefined entirely, don't update it to avoid wiping out accidently.
        // It accepts `null` to clear it, or the object to save.
        specs: specs !== undefined ? (Object.keys(specs || {}).length > 0 ? specs : null) : undefined,
        remark: remark !== undefined ? remark : undefined
      },
      include: {
        category: true,
        supplier: true,
      }
    });

    const storage = await getStorageStrategy();
    return NextResponse.json({
      ...updatedProduct,
      image: updatedProduct.image ? storage.resolveUrl(updatedProduct.image) : null
    });
  } catch (error: unknown) {
    // Handle Prisma Unique Constraint Violated error (SKU already exists)
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return NextResponse.json({ 
        error: "商品编码 (SKU) 已存在，请使用其他编码" 
      }, { status: 400 });
    }

    console.error("Failed to update product:", error);

    return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
  }
}

// 删除商品
export async function DELETE(request: Request) {
  try {
    const user = await getAuthorizedUser("product:delete");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    // Security check: Global access
    const product = await prisma.product.findFirst({
      where: { id, userId: user.id }
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Delete related records first to avoid foreign key constraint errors
    // 1. Delete gallery items
    await prisma.galleryItem.deleteMany({
      where: { productId: id }
    });

    // 2. Delete gallery submissions
    await prisma.gallerySubmission.deleteMany({
        where: { productId: id }
    });

    // 3. Finally delete the product
    await prisma.product.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Failed to delete product:", error);
    
    // Handle Prisma Foreign Key Constraint error (linked to orders, etc.)
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2003') {
      return NextResponse.json({ 
        error: "该商品存在订单或交易记录，为了审计安全无法删除。建议调整库存或修改信息。" 
      }, { status: 409 });
    }

    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
  }
}
