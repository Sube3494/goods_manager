import { Prisma } from "../../prisma/generated-client";

function normalizeSingleMeituanSkuId(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

export function normalizeMeituanSkuIds(value: unknown): string[] {
  const candidates = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[，,]+/g)
      : [];

  const unique = new Set<string>();
  for (const item of candidates) {
    const normalized = normalizeSingleMeituanSkuId(item);
    if (normalized) {
      unique.add(normalized);
    }
  }

  return Array.from(unique);
}

export function getPrimaryMeituanSkuId(meituanSkuIds: string[]) {
  return meituanSkuIds[0] || null;
}

export async function findConflictingProductMeituanSkuIds(
  tx: Prisma.TransactionClient,
  userId: string,
  meituanSkuIds: string[],
  excludeProductId?: string
) {
  if (!userId || meituanSkuIds.length === 0) {
    return [];
  }

  const mappingHits = await tx.productMeituanSku.findMany({
    where: {
      userId,
      meituanSkuId: { in: meituanSkuIds },
      ...(excludeProductId ? { productId: { not: excludeProductId } } : {}),
    },
    select: {
      meituanSkuId: true,
      productId: true,
      product: {
        select: {
          name: true,
        },
      },
    },
  });

  const results = new Map<string, { productId: string; name: string }>();

  for (const hit of mappingHits) {
    results.set(hit.meituanSkuId, {
      productId: hit.productId,
      name: hit.product.name,
    });
  }

  return Array.from(results.entries()).map(([meituanSkuId, product]) => ({
    meituanSkuId,
    ...product,
  }));
}

export async function replaceProductMeituanSkuMappings(
  tx: Prisma.TransactionClient,
  productId: string,
  userId: string | null | undefined,
  meituanSkuIds: string[]
) {
  // 先清理旧的映射
  await tx.productMeituanSku.deleteMany({
    where: { productId },
  });

  if (!userId || meituanSkuIds.length === 0) {
    // 同时更新相关导入项的状态为 UNMATCHED
    await tx.meituanImportItem.updateMany({
      where: { bindProductId: productId },
      data: {
        bindProductId: null,
        status: "UNMATCHED",
      },
    });
    return;
  }

  // 写入新的映射
  await tx.productMeituanSku.createMany({
    data: meituanSkuIds.map((meituanSkuId) => ({
      productId,
      userId,
      meituanSkuId,
    })),
    skipDuplicates: true,
  });

  // 同步美团导入数据池 items 关联状态
  await tx.meituanImportItem.updateMany({
    where: {
      userId,
      meituanSkuId: { in: meituanSkuIds },
    },
    data: {
      bindProductId: productId,
      status: "BOUND",
    },
  });

  // 将不再属于当前商品的导入项解绑
  await tx.meituanImportItem.updateMany({
    where: {
      userId,
      bindProductId: productId,
      meituanSkuId: { notIn: meituanSkuIds },
    },
    data: {
      bindProductId: null,
      status: "UNMATCHED",
    },
  });
}

export function mergeResolvedMeituanSkuIds(
  mappings?: Array<{ meituanSkuId: string }>
) {
  const merged = new Set<string>();
  for (const item of mappings || []) {
    const value = normalizeSingleMeituanSkuId(item.meituanSkuId);
    if (value) {
      merged.add(value);
    }
  }

  return Array.from(merged);
}
