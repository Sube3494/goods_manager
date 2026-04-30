import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getLightSession } from "@/lib/auth";
import { getStorageStrategy } from "@/lib/storage";
import { handlePrismaError } from "@/lib/api-errors";
import { findConflictingProductJdSkuIds, getPrimaryJdSkuId, normalizeJdSkuIds, replaceProductJdSkuMappings } from "@/lib/productJdSku";

function normalizeSku(sku: unknown) {
  if (typeof sku !== "string") {
    return null;
  }

  const trimmed = sku.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getLightSession();
    const { id } = await params;
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        supplier: true,
        jdSkuMappings: {
          select: { jdSkuId: true },
          orderBy: { createdAt: "asc" }
        },
        gallery: {
          orderBy: [
            { sortOrder: 'asc' },
            { createdAt: 'asc' }
          ]
        },
        orderItems: {
          include: {
            purchaseOrder: true
          }
        }
      }
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Visibility check
    const isOwner = session?.id && product.userId === session.id;
    const isAdmin = session?.role === "SUPER_ADMIN";
    
    if (!product.isPublic && !isOwner && !isAdmin) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const storage = await getStorageStrategy();
    const resolvedProduct = {
      ...product,
      image: product.image ? storage.resolveUrl(product.image) : null,
      jdSkuIds: product.jdSkuMappings.map((item) => item.jdSkuId),
      gallery: product.gallery.map(item => ({
        ...item,
        url: storage.resolveUrl(item.url),
        thumbnailUrl: item.thumbnailUrl ? storage.resolveUrl(item.thumbnailUrl) : storage.resolveUrl(item.url)
      }))
    };

    return NextResponse.json(resolvedProduct);
  } catch {
    return NextResponse.json({ error: "Failed to fetch product" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getLightSession();
    if (!session || !session.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;

    // Ownership check for non-admin
    if (session.role !== "SUPER_ADMIN") {
      const existing = await prisma.product.findUnique({
        where: { id },
        select: { userId: true }
      });
      if (existing && existing.userId !== session.id) {
        return NextResponse.json({ error: "Permission denied" }, { status: 403 });
      }
    }

    const body = await request.json();
    const { name, sku, jdSkuId, jdSkuIds, costPrice, stock, categoryId, supplierId, image, isPublic, remark } = body;
    const normalizedSku = normalizeSku(sku);
    const normalizedJdSkuIds = normalizeJdSkuIds(jdSkuIds ?? jdSkuId);
    const normalizedJdSkuId = getPrimaryJdSkuId(normalizedJdSkuIds);

    if (normalizedSku) {
      const conflict = await prisma.product.findFirst({
        where: {
          sku: normalizedSku,
          id: { not: id }
        },
        select: { id: true }
      });

      if (conflict) {
        return NextResponse.json({
          error: `商品编码 (SKU) "${normalizedSku}" 已存在，请使用其他编码`
        }, { status: 409 });
      }
    }

    if (normalizedJdSkuIds.length > 0) {
      const conflicts = await findConflictingProductJdSkuIds(prisma, session.id, normalizedJdSkuIds, id);
      if (conflicts.length > 0) {
        return NextResponse.json({
          error: `主商品库里 JD SKU ID "${conflicts[0].jdSkuId}" 已存在，请检查是否重复建品`
        }, { status: 409 });
      }
    }

    const product = await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          name,
          sku: normalizedSku,
          jdSkuId: normalizedJdSkuId,
          costPrice: Number(costPrice || body.price),
          stock: Number(stock),
          categoryId,
          supplierId,
          image,
          isPublic,
          remark: remark !== undefined ? remark : undefined
        }
      });

      await replaceProductJdSkuMappings(tx, id, session.id, normalizedJdSkuIds);

      return tx.product.findUniqueOrThrow({
        where: { id },
        include: {
          jdSkuMappings: {
            select: { jdSkuId: true },
            orderBy: { createdAt: "asc" }
          },
        },
      });
    });

    const storage = await getStorageStrategy();
    return NextResponse.json({
      ...product,
      image: product.image ? storage.resolveUrl(product.image) : null,
      jdSkuIds: product.jdSkuMappings.map((item) => item.jdSkuId),
    });
  } catch (error: unknown) {
    return handlePrismaError(error, "商品", "Failed to update product");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getLightSession();
    if (!session || !session.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;

    // Fetch existing product to check ownership
    const product = await prisma.product.findUnique({
      where: { id },
      include: { gallery: true }
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Ownership check for non-admin
    if (session.role !== "SUPER_ADMIN" && product.userId !== session.id) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    if (product) {
      try {
        const storage = await getStorageStrategy();
        const urlsToDelete: string[] = [];

        // 商品主图
        if (product.image) urlsToDelete.push(product.image);
        // 相册图片
        product.gallery.forEach(item => {
          if (item.url) urlsToDelete.push(item.url);
          if (item.thumbnailUrl) urlsToDelete.push(item.thumbnailUrl);
        });

        // 执行物理删除
        await Promise.allSettled(
          urlsToDelete.map(url => storage.delete(url))
        );
      } catch (storageError) {
        console.error("Product physical file deletion failed:", storageError);
      }

      await prisma.product.delete({
        where: { id }
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
  }
}
