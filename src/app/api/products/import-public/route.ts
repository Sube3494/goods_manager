import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { ProductService } from "@/services/productService";

async function ensureCategory(userId: string, sourceCategoryName?: string | null) {
  const name = sourceCategoryName?.trim() || "其他分类";

  let category = await prisma.category.findFirst({
    where: { userId, name },
  });

  if (!category) {
    category = await prisma.category.create({
      data: {
        userId,
        name,
      },
    });
  }

  return category;
}

async function ensureSupplier(userId: string, sourceSupplierName?: string | null) {
  const name = sourceSupplierName?.trim();
  if (!name) {
    return null;
  }

  let supplier = await prisma.supplier.findFirst({
    where: { userId, name },
  });

  if (!supplier) {
    supplier = await prisma.supplier.create({
      data: {
        userId,
        name,
        contact: "",
        phone: "",
        email: "",
        address: "",
      },
    });
  }

  return supplier;
}

async function generateAvailableSku(baseSku: string | null) {
  if (!baseSku) {
    return null;
  }

  const normalizedBase = baseSku.trim();
  if (!normalizedBase) {
    return null;
  }

  const directHit = await prisma.product.findUnique({
    where: { sku: normalizedBase },
    select: { id: true },
  });

  if (!directHit) {
    return normalizedBase;
  }

  for (let i = 1; i <= 999; i += 1) {
    const candidate = `${normalizedBase}-COPY${i}`;
    const hit = await prisma.product.findUnique({
      where: { sku: candidate },
      select: { id: true },
    });

    if (!hit) {
      return candidate;
    }
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const user = await getAuthorizedUser("product:create");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    }

    const body = await request.json();
    const sourceProductId = String(body?.sourceProductId || "").trim();

    if (!sourceProductId) {
      return NextResponse.json({ error: "Missing source product ID" }, { status: 400 });
    }

    const existingImported = await prisma.product.findFirst({
      where: {
        userId: user.id,
        sourceProductId,
      },
      include: {
        category: true,
        supplier: true,
        gallery: {
          take: 1,
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    if (existingImported) {
      return NextResponse.json({
        product: await ProductService.formatResponse([existingImported], 1, 1, 1).then((result) => result.items[0]),
        imported: false,
        message: "该公共商品已在你的商品库中",
      });
    }

    const sourceProduct = await prisma.product.findFirst({
      where: {
        id: sourceProductId,
        isPublic: true,
      },
      include: {
        category: true,
        supplier: true,
        gallery: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    if (!sourceProduct) {
      return NextResponse.json({ error: "Public product not found" }, { status: 404 });
    }

    if (sourceProduct.userId === user.id) {
      return NextResponse.json({
        error: "这是你自己的商品，无需导入",
      }, { status: 409 });
    }

    const [category, supplier, sku] = await Promise.all([
      ensureCategory(user.id, sourceProduct.category?.name),
      ensureSupplier(user.id, sourceProduct.supplier?.name),
      generateAvailableSku(sourceProduct.sku),
    ]);

    const product = await prisma.product.create({
      data: {
        name: sourceProduct.name,
        sku,
        costPrice: sourceProduct.costPrice,
        stock: 0,
        image: sourceProduct.image,
        categoryId: category.id,
        supplierId: supplier?.id || null,
        isPublic: false,
        isDiscontinued: sourceProduct.isDiscontinued,
        specs: sourceProduct.specs ?? undefined,
        pinyin: ProductService.generatePinyinSearchText(sourceProduct.name),
        remark: sourceProduct.remark,
        userId: user.id,
        sourceProductId: sourceProduct.id,
        gallery: sourceProduct.gallery.length
          ? {
              create: sourceProduct.gallery.map((item) => ({
                url: item.url,
                thumbnailUrl: item.thumbnailUrl,
                tags: item.tags,
                isPublic: item.isPublic,
                type: item.type,
                sortOrder: item.sortOrder,
                userId: user.id,
              })),
            }
          : undefined,
      },
      include: {
        category: true,
        supplier: true,
        gallery: {
          take: 1,
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    return NextResponse.json({
      product: await ProductService.formatResponse([product], 1, 1, 1).then((result) => result.items[0]),
      imported: true,
      message: sku && sku !== sourceProduct.sku
        ? `已导入到你的商品库，SKU 自动调整为 ${sku}`
        : "已导入到你的商品库",
    });
  } catch (error) {
    console.error("Failed to import public product:", error);
    return NextResponse.json({ error: "Failed to import public product" }, { status: 500 });
  }
}
