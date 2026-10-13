import deletionPrisma from "@/lib/prisma";
import { deleteCatalogProducts } from "@/lib/deleteCatalogProducts";
import { NextResponse } from "next/server";
import { Prisma } from "../../../../../prisma/generated-client";
import prisma from "@/lib/catalogPrisma";
import { getLightSession, getAuthorizedUser } from "@/lib/auth";
import { getStorageStrategy } from "@/lib/storage";
import { handlePrismaError } from "@/lib/api-errors";
import { findConflictingProductJdSkuIds, getPrimaryJdSkuId, normalizeJdSkuIds, replaceProductJdSkuMappings } from "@/lib/productJdSku";
import { normalizeMeituanSkuIds, replaceProductMeituanSkuMappings } from "@/lib/productMeituanSku";

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
        library: {
          select: { isPublic: true }
        },
        jdSkuMappings: {
          select: { jdSkuId: true },
          orderBy: { createdAt: "asc" }
        },
        meituanSkuMappings: {
          select: { meituanSkuId: true },
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

    // 校验商品所属库的权限
    if (product.library && !product.library.isPublic) {
      const isSuperAdmin = session?.role === "SUPER_ADMIN";
      if (!isSuperAdmin) {
        if (!session?.id) {
          return NextResponse.json({ error: "Permission denied" }, { status: 403 });
        }
        const hasAccess = await prisma.productLibrary.findFirst({
          where: {
            id: product.libraryId!,
            authorizedUsers: {
              some: { id: session.id }
            }
          }
        });
        if (!hasAccess) {
          return NextResponse.json({ error: "Permission denied" }, { status: 403 });
        }
      }
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
      meituanSkuIds: product.meituanSkuMappings.map((item) => item.meituanSkuId),
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
    const { name, sku, jdSkuId, jdSkuIds, meituanSkuId, meituanSkuIds, doudianSkuId, costPrice, categoryId, supplierId, image, isPublic, remark, isShelfLife, shelfLifeDays } = body;
    const normalizedSku = normalizeSku(sku);
    const normalizedJdSkuIds = normalizeJdSkuIds(jdSkuIds ?? jdSkuId);
    const normalizedJdSkuId = getPrimaryJdSkuId(normalizedJdSkuIds);
    const normalizedMeituanSkuIds = normalizeMeituanSkuIds(meituanSkuIds ?? meituanSkuId);

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

    const storage = await getStorageStrategy();
    const existingProduct = await prisma.product.findUnique({ where: { id }, select: { image: true } });
    const strippedImage = image ? storage.stripUrl(image) : null;
    const finalImage = image !== undefined && image !== "" ? strippedImage : (existingProduct?.image || null);

    const product = await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          name,
          sku: normalizedSku,
          jdSkuId: normalizedJdSkuId,
          doudianSkuId: doudianSkuId !== undefined ? (String(doudianSkuId || "").trim() || null) : undefined,
          costPrice: Number(costPrice || body.price),
          categoryId,
          supplierId,
          image: finalImage,
          isPublic,
          remark: remark !== undefined ? remark : undefined,
          isShelfLife: isShelfLife !== undefined ? Boolean(isShelfLife) : undefined,
          shelfLifeDays: isShelfLife === false ? null : (shelfLifeDays !== undefined ? (Number(shelfLifeDays) || null) : undefined),
          isBundle: body.isBundle !== undefined ? Boolean(body.isBundle) : undefined,
          bundleItems: body.bundleItems !== undefined ? (Array.isArray(body.bundleItems) ? body.bundleItems : (body.isBundle ? [] : Prisma.JsonNull)) : undefined
        }
      });

      if (body.isBundle !== undefined || body.bundleItems !== undefined) {
        await tx.shopProduct.updateMany({
          where: { productId: id },
          data: {
            ...(body.isBundle !== undefined ? { isBundle: Boolean(body.isBundle) } : {}),
            ...(body.bundleItems !== undefined ? { bundleItems: Array.isArray(body.bundleItems) ? body.bundleItems : (body.isBundle ? [] : Prisma.JsonNull) } : {}),
          },
        });
      }

      if (image !== undefined) {
        await tx.shopProduct.updateMany({
          where: {
            productId: id,
            OR: [
              { productImage: null },
              ...(existingProduct?.image ? [{ productImage: existingProduct.image }] : []),
            ],
          },
          data: {
            productImage: null,
          },
        });
      }

      await replaceProductJdSkuMappings(tx, id, session.id, normalizedJdSkuIds);
      await replaceProductMeituanSkuMappings(tx, id, session.id, normalizedMeituanSkuIds);

      return tx.product.findUniqueOrThrow({
        where: { id },
        include: {
          jdSkuMappings: {
            select: { jdSkuId: true },
            orderBy: { createdAt: "asc" }
          },
          meituanSkuMappings: {
            select: { meituanSkuId: true },
            orderBy: { createdAt: "asc" }
          },
        },
      });
    });

    return NextResponse.json({
      ...product,
      image: product.image ? storage.resolveUrl(product.image) : null,
      jdSkuIds: product.jdSkuMappings.map((item) => item.jdSkuId),
      meituanSkuIds: product.meituanSkuMappings.map((item) => item.meituanSkuId),
    });
  } catch (error: unknown) {
    return handlePrismaError(error, "商品", "Failed to update product");
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthorizedUser("product:delete");
    if (!user) return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    const id = (await params).id;
    if (!id) return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    const result = await deletionPrisma.$transaction((tx) => deleteCatalogProducts(tx, [id], user));
    if (!result.count) return NextResponse.json({ error: "Product not found or permission denied" }, { status: 404 });
    return NextResponse.json({ success: true, ...result, message: "商品及其复制商品已删除，历史交易记录已保留。" });
  } catch (error) {
    return handlePrismaError(error, "商品", "Failed to delete product");
  }
}
