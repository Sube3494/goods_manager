import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";

// 获取所有商品 (支持分页、筛选、排序)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const search = searchParams.get("search") || "";
    const categoryName = searchParams.get("category") || "all";
    const status = searchParams.get("status") || "all";
    const sortByParam = searchParams.get("sortBy") || "sku-asc";
    const idsOnly = searchParams.get("idsOnly") === "true";

    const [field, order] = sortByParam.split("-") as [string, "asc" | "desc"];

    // 查询系统设置（获取库存预警阈值）
    const settings = await prisma.systemSetting.findFirst();
    const lowStockThreshold = settings?.lowStockThreshold || 10;

    // 构建查询条件
    const where: {
      OR?: Array<{
        name?: { contains: string; mode: "insensitive" };
        sku?: { contains: string; mode: "insensitive" };
        category?: { name: { contains: string; mode: "insensitive" } };
      }>;
      category?: { name: string };
      stock?: { lt: number };
      isPublic?: boolean;
    } = {};

    // 搜索词过滤 (支持 SKU、名称、分类)
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { sku: { contains: search, mode: "insensitive" } },
        { category: { name: { contains: search, mode: "insensitive" } } }
      ];
    }

    // 分类过滤
    if (categoryName !== "all") {
      where.category = { name: categoryName };
    }

    // 状态过滤 (库存预警、可见性)
    if (status === "low_stock") {
      where.stock = { lt: lowStockThreshold };
    } else if (status === "public") {
      where.isPublic = true;
    } else if (status === "private") {
      where.isPublic = false;
    }

    // 构建排序
    let orderBy: Array<Record<string, "asc" | "desc" | { [key: string]: "asc" | "desc" }>> = [];
    if (field === "sku") {
      // 在 SQL 层面，我们无法直接用 Prisma 实现自然排序，
      // 但可以通过增加一个基于长度的排序规则来大幅改善 10 vs 100 的问题。
      // 注意：Prisma 不支持直接在 orderBy 中写表达式，所以这里我们保持 sku 排序，
      // 并在前端进行最终的自然排序微调。为了让分页结果更接近预期，我们这里仅保留 sku。
      orderBy = [{ sku: order }, { createdAt: "desc" }];
    } else if (field === "createdAt") {
      orderBy = [{ createdAt: order }];
    } else if (field === "stock") {
      orderBy = [{ stock: order }];
    } else if (field === "name") {
      orderBy = [{ name: order }];
    } else {
      orderBy = [{ createdAt: "desc" }];
    }

    // 执行分页查询
    const skip = (page - 1) * pageSize;
    let products = [];
    let total = 0;

    if (field === "sku") {
      // --- 混合自然排序模式 ---
      // 1. 获取所有符合条件的 ID 和 SKU
      const allProductIds = await prisma.product.findMany({
        where,
        select: { id: true, sku: true },
        // 不需要在这里 orderBy，我们之后在 JS 里排
      });
      total = allProductIds.length;

      // 2. 在 JS 中进行全局自然排序
      allProductIds.sort((a, b) => {
        const aVal = a.sku || "";
        const bVal = b.sku || "";
        return order === 'asc' 
          ? aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' })
          : bVal.localeCompare(aVal, undefined, { numeric: true, sensitivity: 'base' });
      });

      // 3. 截取当前页的 ID
      const pageIds = allProductIds.slice(skip, skip + pageSize).map(p => p.id);

      // 4. 获取详细数据（保持顺序）
      const detailedProducts = await prisma.product.findMany({
        where: { id: { in: pageIds } },
        include: {
          category: true,
          supplier: true,
        },
      });

      // 5. 由于 in 并不保证顺序，我们需要按 pageIds 重新排序
      products = pageIds.map(id => detailedProducts.find((d) => d.id === id)).filter(Boolean);

      if (idsOnly) {
        return NextResponse.json({ 
          ids: allProductIds.map(p => p.id),
          total
        });
      }
    } else {
      // --- 原生数据库分页模式 (用于时间、库存等) ---
      if (idsOnly) {
        const allMatchingIds = await prisma.product.findMany({
          where,
          select: { id: true },
          orderBy,
        });
        return NextResponse.json({ 
          ids: allMatchingIds.map(p => p.id),
          total: allMatchingIds.length
        });
      }

      [products, total] = await Promise.all([
        prisma.product.findMany({
          where,
          include: {
            category: true,
            supplier: true,
          },
          orderBy,
          skip,
          take: pageSize,
        }),
        prisma.product.count({ where })
      ]);
    }



    return NextResponse.json({
      items: products,
      total,
      page,
      pageSize,
      hasMore: (skip + products.length) < total,
    });
  } catch (error) {
    console.error("Failed to fetch products:", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}

// 创建新商品
export async function POST(request: Request) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "product:create")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const body = await request.json();
    const { name, sku, costPrice, stock, categoryId, supplierId, image, isPublic, specs } = body;

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
        isPublic: isPublic ?? true,
        specs: specs !== undefined ? (Object.keys(specs || {}).length > 0 ? specs : null) : undefined,
        workspaceId: session.workspaceId,
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
          workspaceId: session.workspaceId,
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

    return NextResponse.json(product);
  } catch (error: unknown) {
    console.error("Failed to create product:", error);
    
    // Handle Prisma Foreign Key Constraint Violated error
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2003') {
      return NextResponse.json({ 
        error: "无效的分类或供应商 ID，请检查关联选项" 
      }, { status: 400 });
    }

    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}

// 更新商品
export async function PUT(request: Request) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "product:update")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const body = await request.json();
    const { id, name, sku, costPrice, stock, categoryId, supplierId, image, isPublic, specs } = body;

    if (!id) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    const existing = await prisma.product.findFirst({
      where: { id }
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
        isPublic: isPublic ?? undefined,
        // Using Prisma Json values correctly. If specs is explicitly sent (even empty object), save it. 
        // If undefined entirely, don't update it to avoid wiping out accidently.
        // It accepts `null` to clear it, or the object to save.
        specs: specs !== undefined ? (Object.keys(specs || {}).length > 0 ? specs : null) : undefined
      },
      include: {
        category: true,
        supplier: true,
      }
    });

    return NextResponse.json(updatedProduct);
  } catch (error) {
    console.error("Failed to update product:", error);
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
  }
}

// 删除商品
export async function DELETE(request: Request) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "product:delete")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    // Security check: Global access
    const product = await prisma.product.findFirst({
      where: { id }
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
