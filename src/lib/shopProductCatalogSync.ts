import { Prisma } from "../../prisma/generated-client";
import { ProductService } from "@/services/productService";
import { getPrimaryJdSkuId, normalizeJdSkuIds, replaceProductJdSkuMappings } from "@/lib/productJdSku";

type CategoryRecord = { id: string; name: string } | null;

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

export async function resolveOrCreateOwnedCategory(
  tx: Prisma.TransactionClient,
  ownerUserId: string,
  categoryId: string | null | undefined,
  categoryName: string | null | undefined
): Promise<CategoryRecord> {
  const normalizedCategoryId = normalizeText(categoryId);
  const normalizedCategoryName = normalizeText(categoryName);

  if (normalizedCategoryId) {
    const existingById = await tx.category.findFirst({
      where: {
        id: normalizedCategoryId,
        userId: ownerUserId,
      },
      select: {
        id: true,
        name: true,
      },
    });
    if (existingById) {
      return existingById;
    }
  }

  if (!normalizedCategoryName) {
    const fallbackName = "未分类";
    const existingFallback = await tx.category.findFirst({
      where: {
        userId: ownerUserId,
        name: fallbackName,
      },
      select: {
        id: true,
        name: true,
      },
    });
    if (existingFallback) {
      return existingFallback;
    }

    return await tx.category.create({
      data: {
        userId: ownerUserId,
        name: fallbackName,
      },
      select: {
        id: true,
        name: true,
      },
    });
  }

  const existingByName = await tx.category.findFirst({
    where: {
      userId: ownerUserId,
      name: normalizedCategoryName,
    },
    select: {
      id: true,
      name: true,
    },
  });
  if (existingByName) {
    return existingByName;
  }

  return await tx.category.create({
    data: {
      userId: ownerUserId,
      name: normalizedCategoryName,
    },
    select: {
      id: true,
      name: true,
    },
  });
}

export async function syncStandaloneShopProductToCatalog(
  tx: Prisma.TransactionClient,
  input: {
    ownerUserId: string;
    linkedProductId?: string | null;
    name: string;
    jdSkuId?: string | null;
    categoryId?: string | null;
    categoryName?: string | null;
    supplierId?: string | null;
    image?: string | null;
    remark?: string | null;
  }
) {
  const category = await resolveOrCreateOwnedCategory(
    tx,
    input.ownerUserId,
    input.categoryId,
    input.categoryName
  );
  if (!category) {
    throw new Error("Failed to resolve category for standalone shop product sync");
  }

  const productPayload = {
    name: input.name,
    jdSkuId: getPrimaryJdSkuId(normalizeJdSkuIds(input.jdSkuId)),
    categoryId: category.id,
    supplierId: normalizeText(input.supplierId) || null,
    image: normalizeText(input.image) || null,
    pinyin: ProductService.generatePinyinSearchText(input.name),
    isShopOnly: true,
    remark: input.remark ?? null,
  };

  const normalizedLinkedProductId = normalizeText(input.linkedProductId);
  if (normalizedLinkedProductId) {
    const existingLinked = await tx.product.findFirst({
      where: {
        id: normalizedLinkedProductId,
        userId: input.ownerUserId,
        isShopOnly: true,
      },
      select: {
        id: true,
      },
    });

    if (existingLinked) {
      const updated = await tx.product.update({
        where: { id: existingLinked.id },
        data: productPayload,
        select: {
          id: true,
          categoryId: true,
        },
      });

      await replaceProductJdSkuMappings(
        tx,
        updated.id,
        input.ownerUserId,
        normalizeJdSkuIds(input.jdSkuId)
      );

      return {
        productId: updated.id,
        categoryId: updated.categoryId || null,
        categoryName: category.name,
        created: false,
      };
    }
  }

  const created = await tx.product.create({
    data: {
      ...productPayload,
      sku: null,
      costPrice: 0,
      stock: 0,
      userId: input.ownerUserId,
    },
    select: {
      id: true,
      categoryId: true,
    },
  });

  await replaceProductJdSkuMappings(
    tx,
    created.id,
    input.ownerUserId,
    normalizeJdSkuIds(input.jdSkuId)
  );

  return {
    productId: created.id,
      categoryId: created.categoryId || null,
      categoryName: category.name,
    created: true,
  };
}
