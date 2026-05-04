import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getStorageStrategy } from "@/lib/storage";
import { getLightSession, getCachedSettings, getAuthorizedUser } from "@/lib/auth";
import { handlePrismaError } from "@/lib/api-errors";
import { ProductService } from "@/services/productService";
import { Prisma } from "../../../../prisma/generated-client";
import { findConflictingProductJdSkuIds, getPrimaryJdSkuId, normalizeJdSkuIds, replaceProductJdSkuMappings } from "@/lib/productJdSku";

function normalizeSku(sku: unknown) {
  if (typeof sku !== "string") {
    return null;
  }

  const trimmed = sku.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function findConflictingProductBySku(sku: string, excludeId?: string) {
  return prisma.product.findFirst({
    where: {
      sku,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      id: true,
      name: true,
      sku: true,
    },
  });
}

async function findConflictingShopProductBySku(shopId: string, sku: string, excludeId?: string) {
  return prisma.shopProduct.findFirst({
    where: {
      shopId,
      sku,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      id: true,
      productName: true,
      sku: true,
    },
  });
}

async function findConflictingShopProductByJdSkuId(shopId: string, jdSkuId: string, excludeId?: string) {
  return prisma.shopProduct.findFirst({
    where: {
      shopId,
      jdSkuId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      id: true,
      productName: true,
      jdSkuId: true,
    },
  });
}

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
    const sortByParam = searchParams.get("sortBy") || "sku-desc";
    const idsOnly = searchParams.get("idsOnly") === "true";
    const supplierId = searchParams.get("supplierId") || "all";
    const includePublic = searchParams.get("includePublic") === "true";
    const publicOnly = searchParams.get("publicOnly") === "true";
    const pickerView = searchParams.get("view") === "picker";
    const shopId = searchParams.get("shopId") || undefined;
    const includeShopOnly = searchParams.get("includeShopOnly") === "true";
    const shopFilterModeParam = searchParams.get("shopFilterMode");
    const shopFilterMode = shopFilterModeParam === "unassigned" ? "unassigned" : "assigned";

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
      supplierId,
      includePublic,
      publicOnly,
      pickerView,
      shopId,
      shopFilterMode,
      includeShopOnly,
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
    const { name, sku, jdSkuId, jdSkuIds, costPrice, stock, categoryId, supplierId, image, isPublic, isDiscontinued, specs, remark, shopId, isShopOnly } = body;
    const normalizedSku = normalizeSku(sku);
    const normalizedJdSkuIds = normalizeJdSkuIds(jdSkuIds ?? jdSkuId);
    const normalizedJdSkuId = getPrimaryJdSkuId(normalizedJdSkuIds);

    const storage = await getStorageStrategy();

    // 格式化价格和库存
    const stockNum = Number(stock) || 0;

    let resolvedShopId: string | null = null;
    let resolvedShopName = "";
    if (shopId) {
      const shop = await prisma.shop.findFirst({
        where: user.role === "SUPER_ADMIN" ? { id: String(shopId) } : { id: String(shopId), userId: user.id },
        select: { id: true, name: true },
      });

      if (!shop) {
        return NextResponse.json({ error: "店铺不存在" }, { status: 404 });
      }

      resolvedShopId = shop.id;
      resolvedShopName = shop.name || "";
    }

    const category = categoryId
      ? await prisma.category.findFirst({
          where: user.role === "SUPER_ADMIN"
            ? { id: categoryId }
            : { id: categoryId, userId: user.id },
          select: { id: true, name: true },
        })
      : null;

    if (resolvedShopId && isShopOnly) {
      if (normalizedSku) {
        const existingShopProduct = await findConflictingShopProductBySku(resolvedShopId, normalizedSku);
        if (existingShopProduct) {
          return NextResponse.json({
            error: `当前店铺内商品编码 (SKU) "${normalizedSku}" 已存在，请使用其他编码`
          }, { status: 409 });
        }
      }

      if (normalizedJdSkuId) {
        const existingJdSkuShopProduct = await findConflictingShopProductByJdSkuId(resolvedShopId, normalizedJdSkuId);
        if (existingJdSkuShopProduct) {
          return NextResponse.json({
            error: `当前店铺内 JD SKU ID "${normalizedJdSkuId}" 已存在，请检查映射商品`
          }, { status: 409 });
        }
      }

      const created = await prisma.shopProduct.create({
        data: {
          shopId: resolvedShopId,
          productId: null,
          sourceProductId: null,
          sku: normalizedSku,
          jdSkuId: normalizedJdSkuId,
          productName: name,
          pinyin: ProductService.generatePinyinSearchText(name),
          productImage: storage.stripUrl(image),
          categoryId: categoryId || null,
          categoryName: category?.name || null,
          supplierId: supplierId || null,
          costPrice: Number(costPrice) || 0,
          stock: stockNum,
          isPublic: isPublic ?? true,
          isDiscontinued: isDiscontinued ?? false,
          remark: remark || null,
          specs: specs !== undefined ? (Object.keys(specs || {}).length > 0 ? specs : Prisma.JsonNull) : undefined,
        },
      });

      return NextResponse.json({
        id: created.id,
        shopProductId: created.id,
        sourceType: "shopProduct",
        sourceProductId: null,
        productId: null,
        isStandaloneShopProduct: true,
        name: created.productName || name,
        sku: created.sku,
        jdSkuId: created.jdSkuId,
        categoryId: created.categoryId,
        costPrice: created.costPrice,
        stock: created.stock,
        image: created.productImage ? storage.resolveUrl(created.productImage) : null,
        supplierId: created.supplierId,
        isPublic: created.isPublic,
        isDiscontinued: created.isDiscontinued,
        specs: created.specs,
        remark: created.remark,
        shopId: created.shopId,
        shopName: resolvedShopName,
        assignedShopIds: [created.shopId],
      });
    }

    if (normalizedSku) {
      const existingProduct = await findConflictingProductBySku(normalizedSku);
      if (existingProduct) {
        return NextResponse.json({
          error: `商品编码 (SKU) "${normalizedSku}" 已存在，请使用其他编码`
        }, { status: 409 });
      }
    }

    if (resolvedShopId && normalizedSku) {
      const existingShopProduct = await findConflictingShopProductBySku(resolvedShopId, normalizedSku);
      if (existingShopProduct) {
        return NextResponse.json({
          error: `当前店铺内商品编码 (SKU) "${normalizedSku}" 已存在，请使用其他编码`
        }, { status: 409 });
      }
    }

    if (resolvedShopId && normalizedJdSkuId) {
      const existingJdSkuShopProduct = await findConflictingShopProductByJdSkuId(resolvedShopId, normalizedJdSkuId);
      if (existingJdSkuShopProduct) {
        return NextResponse.json({
          error: `当前店铺内 JD SKU ID "${normalizedJdSkuId}" 已存在，请检查映射商品`
        }, { status: 409 });
      }
    }

    if (normalizedJdSkuIds.length > 0) {
      const conflictingJdSkuIds = await findConflictingProductJdSkuIds(prisma, user.id, normalizedJdSkuIds);
      if (conflictingJdSkuIds.length > 0) {
        return NextResponse.json({
          error: `主商品库里 JD SKU ID "${conflictingJdSkuIds[0].jdSkuId}" 已存在，请检查是否重复建品`
        }, { status: 409 });
      }
    }

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name,
          sku: normalizedSku,
          jdSkuId: normalizedJdSkuId,
          costPrice: Number(costPrice) || 0,
          stock: 0,
          categoryId: categoryId || undefined,
          supplierId: supplierId || null,
          image: storage.stripUrl(image),
          pinyin: ProductService.generatePinyinSearchText(name),
          isPublic: isPublic ?? true,
          isDiscontinued: isDiscontinued ?? false,
          isShopOnly: Boolean(isShopOnly && resolvedShopId),
          specs: specs !== undefined ? (Object.keys(specs || {}).length > 0 ? specs : null) : undefined,
          remark: remark || null,
          userId: user.id,
          ...(resolvedShopId ? {
            shopProducts: {
              create: [{
                shopId: resolvedShopId,
                sourceProductId: undefined,
                sku: normalizedSku,
                jdSkuId: normalizedJdSkuId,
                productName: name,
                pinyin: ProductService.generatePinyinSearchText(name),
                productImage: storage.stripUrl(image),
                categoryId: categoryId || null,
                categoryName: category?.name || null,
                supplierId: supplierId || null,
                costPrice: Number(costPrice) || 0,
                stock: stockNum,
                isPublic: isPublic ?? true,
                isDiscontinued: isDiscontinued ?? false,
                remark: remark || null,
                specs: specs !== undefined ? (Object.keys(specs || {}).length > 0 ? specs : null) : undefined,
              }],
            },
          } : {}),
        },
        include: {
          category: true,
          supplier: true,
          shopProducts: { select: { shopId: true } },
          jdSkuMappings: { select: { jdSkuId: true }, orderBy: { createdAt: "asc" } },
        }
      });

      await replaceProductJdSkuMappings(tx, created.id, user.id, normalizedJdSkuIds);

      return tx.product.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          category: true,
          supplier: true,
          shopProducts: { select: { shopId: true } },
          jdSkuMappings: { select: { jdSkuId: true }, orderBy: { createdAt: "asc" } },
        },
      });
    });

    return NextResponse.json({
      ...product,
      image: product.image ? storage.resolveUrl(product.image) : null,
      assignedShopIds: product.shopProducts.map((item) => item.shopId),
      jdSkuIds: product.jdSkuMappings.map((item) => item.jdSkuId),
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
    const { id, name, sku, jdSkuId, jdSkuIds, costPrice, categoryId, supplierId, image, isPublic, isDiscontinued, specs, remark } = body;
    const normalizedSku = normalizeSku(sku);
    const normalizedJdSkuIds = normalizeJdSkuIds(jdSkuIds ?? jdSkuId);
    const normalizedJdSkuId = getPrimaryJdSkuId(normalizedJdSkuIds);

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

    if (normalizedSku) {
      const existingProduct = await findConflictingProductBySku(normalizedSku, id);
      if (existingProduct) {
        return NextResponse.json({
          error: `商品编码 (SKU) "${normalizedSku}" 已存在，请使用其他编码`
        }, { status: 409 });
      }
    }

    if (normalizedJdSkuIds.length > 0) {
      const conflictingJdSkuIds = await findConflictingProductJdSkuIds(prisma, user.id, normalizedJdSkuIds, id);
      if (conflictingJdSkuIds.length > 0) {
        return NextResponse.json({
          error: `主商品库里 JD SKU ID "${conflictingJdSkuIds[0].jdSkuId}" 已存在，请检查是否重复建品`
        }, { status: 409 });
      }
    }

    const updatedProduct = await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          name,
          sku: normalizedSku,
          jdSkuId: normalizedJdSkuId,
          costPrice: costPrice !== undefined ? Math.max(0, Number(costPrice) || 0) : undefined,
          categoryId: categoryId || undefined,
          supplierId: supplierId || null,
          image: image !== undefined ? storage.stripUrl(image) : undefined,
          pinyin: name ? ProductService.generatePinyinSearchText(name) : undefined,
          isPublic: isPublic ?? undefined,
          isDiscontinued: isDiscontinued ?? undefined,
          specs: specs !== undefined ? (Object.keys(specs || {}).length > 0 ? specs : null) : undefined,
          remark: remark !== undefined ? remark : undefined
        },
      });

      await replaceProductJdSkuMappings(tx, id, user.id, normalizedJdSkuIds);

      return tx.product.findUniqueOrThrow({
        where: { id },
        include: {
          category: true,
          supplier: true,
          jdSkuMappings: { select: { jdSkuId: true }, orderBy: { createdAt: "asc" } },
        },
      });
    });

    return NextResponse.json({
      ...updatedProduct,
      image: updatedProduct.image ? storage.resolveUrl(updatedProduct.image) : null,
      jdSkuIds: updatedProduct.jdSkuMappings.map((item) => item.jdSkuId),
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

    // 2. Finally delete the product
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
