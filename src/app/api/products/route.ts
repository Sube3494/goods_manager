import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getStorageStrategy } from "@/lib/storage";
import { getLightSession, getCachedSettings, getAuthorizedUser } from "@/lib/auth";
import { handlePrismaError } from "@/lib/api-errors";
import { ProductService } from "@/services/productService";

// 获取所有商品 (支持分页、筛选、排序)
export async function GET(request: Request) {
  try {
    const session = await getLightSession();
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

    const result = await ProductService.getProducts({
      userId: session?.id,
      role: session?.role,
      lowStockThreshold,
      page,
      pageSize,
      search,
      categoryName,
      status,
      field,
      order,
      idsOnly,
      supplierId
    });

    if (idsOnly && 'ids' in result.items) {
      return NextResponse.json(result.items);
    }
    
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch products:", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}

// 创建新商品
export async function POST(request: Request) {
  try {
    const user = await getAuthorizedUser("product:create");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    }

    const body = await request.json();
    const { name, sku, costPrice, stock, categoryId, supplierId, image, isPublic, isDiscontinued, specs, remark, brushKeyword } = body;

    const storage = await getStorageStrategy();

    // 格式化价格和库存
    const stockNum = Number(stock) || 0;

    const product = await prisma.product.create({
      data: {
        name,
        sku: sku?.trim() || null,
        costPrice: Number(costPrice) || 0,
        stock: stockNum,
        categoryId: categoryId || undefined,
        supplierId: supplierId || null,
        image: storage.stripUrl(image),
        pinyin: ProductService.generatePinyinSearchText(name),
        isPublic: isPublic ?? true,
        isDiscontinued: isDiscontinued ?? false,
        specs: specs !== undefined ? (Object.keys(specs || {}).length > 0 ? specs : null) : undefined,
        remark: remark || null,
        brushKeyword: brushKeyword || null,
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

    return NextResponse.json({
      ...product,
      image: product.image ? storage.resolveUrl(product.image) : null
    });
  } catch (error: unknown) {
    return handlePrismaError(error, "商品", "Failed to create product");
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
    const { id, name, sku, costPrice, stock, categoryId, supplierId, image, isPublic, isDiscontinued, specs, remark, brushKeyword } = body;

    const storage = await getStorageStrategy();

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
        image: image !== undefined ? storage.stripUrl(image) : undefined,
        pinyin: name ? ProductService.generatePinyinSearchText(name) : undefined,
        isPublic: isPublic ?? undefined,
        isDiscontinued: isDiscontinued ?? undefined,
        // Using Prisma Json values correctly. If specs is explicitly sent (even empty object), save it. 
        // If undefined entirely, don't update it to avoid wiping out accidently.
        // It accepts `null` to clear it, or the object to save.
        specs: specs !== undefined ? (Object.keys(specs || {}).length > 0 ? specs : null) : undefined,
        remark: remark !== undefined ? remark : undefined,
        brushKeyword: brushKeyword !== undefined ? brushKeyword : undefined
      },
      include: {
        category: true,
        supplier: true,
      }
    });

    return NextResponse.json({
      ...updatedProduct,
      image: updatedProduct.image ? storage.resolveUrl(updatedProduct.image) : null
    });
  } catch (error: unknown) {
    return handlePrismaError(error, "商品", "Failed to update product");
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
    // 软删除机制 (Soft Delete Fallback): 
    // 如果发生外键冲突（已被订单关联），系统将其转为“下架”状态并修改 SKU 防止冲突
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2003') {
      const url = new URL(request.url);
      const id = url.searchParams.get("id");
      if (id) {
        try {
          await prisma.product.update({
            where: { id },
            data: { 
              isDiscontinued: true,
              sku: `DEL-${Date.now().toString().slice(-4)}` // 修改 SKU，释放原 SKU 给用户重用
            }
          });
          return NextResponse.json({ 
            success: true, 
            message: "商品存在交易记录，已自动转为下架并释放原 SKU 以供重新录入。" 
          });
        } catch (updateError) {
          console.error("Soft delete fallback failed:", updateError);
        }
      }
    }
    return handlePrismaError(error, "商品", "Failed to delete product");
  }
}
