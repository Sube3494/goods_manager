import { Prisma } from "../../prisma/generated-client";

function normalizeSingleJdSkuId(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

export function normalizeJdSkuIds(value: unknown): string[] {
  const candidates = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[，,]+/g)
      : [];

  const unique = new Set<string>();
  for (const item of candidates) {
    const normalized = normalizeSingleJdSkuId(item);
    if (normalized) {
      unique.add(normalized);
    }
  }

  return Array.from(unique);
}

export function getPrimaryJdSkuId(jdSkuIds: string[]) {
  return jdSkuIds[0] || null;
}

export async function findConflictingProductJdSkuIds(
  tx: Prisma.TransactionClient,
  userId: string,
  jdSkuIds: string[],
  excludeProductId?: string
) {
  if (!userId || jdSkuIds.length === 0) {
    return [];
  }

  const [mappingHits, legacyHits] = await Promise.all([
    tx.productJdSku.findMany({
      where: {
        userId,
        jdSkuId: { in: jdSkuIds },
        ...(excludeProductId ? { productId: { not: excludeProductId } } : {}),
      },
      select: {
        jdSkuId: true,
        productId: true,
        product: {
          select: {
            name: true,
          },
        },
      },
    }),
    tx.product.findMany({
      where: {
        userId,
        jdSkuId: { in: jdSkuIds },
        ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
      },
      select: {
        id: true,
        name: true,
        jdSkuId: true,
      },
    }),
  ]);

  const results = new Map<string, { productId: string; name: string }>();

  for (const hit of mappingHits) {
    results.set(hit.jdSkuId, {
      productId: hit.productId,
      name: hit.product.name,
    });
  }

  for (const hit of legacyHits) {
    if (!hit.jdSkuId || results.has(hit.jdSkuId)) {
      continue;
    }
    results.set(hit.jdSkuId, {
      productId: hit.id,
      name: hit.name,
    });
  }

  return Array.from(results.entries()).map(([jdSkuId, product]) => ({
    jdSkuId,
    ...product,
  }));
}

export async function replaceProductJdSkuMappings(
  tx: Prisma.TransactionClient,
  productId: string,
  userId: string | null | undefined,
  jdSkuIds: string[]
) {
  await tx.productJdSku.deleteMany({
    where: { productId },
  });

  if (!userId || jdSkuIds.length === 0) {
    return;
  }

  await tx.productJdSku.createMany({
    data: jdSkuIds.map((jdSkuId) => ({
      productId,
      userId,
      jdSkuId,
    })),
    skipDuplicates: true,
  });
}

export function mergeResolvedJdSkuIds(
  primaryJdSkuId: string | null | undefined,
  mappings?: Array<{ jdSkuId: string }>
) {
  const merged = new Set<string>();
  const primary = normalizeSingleJdSkuId(primaryJdSkuId);
  if (primary) {
    merged.add(primary);
  }

  for (const item of mappings || []) {
    const value = normalizeSingleJdSkuId(item.jdSkuId);
    if (value) {
      merged.add(value);
    }
  }

  return Array.from(merged);
}
