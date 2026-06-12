import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { normalizeAutoPickIntegrationConfig } from "@/lib/autoPickOrders";
import { parseAsShanghaiTime } from "@/lib/dateUtils";
import { doesAutoPickOrderRequirePickConfirmation, isAutoPickOrderCancelledStatus, isAutoPickOrderDeletedStatus, isAutoPickOtherPickupOrder, isAutoPickPickCompleted, isAutoPickPickupOrder, resolveAutoPickBusinessStatus } from "@/lib/autoPickOrderStatus";
import { createRequestPerfTracker } from "@/lib/perf";
import { getStorageStrategy } from "@/lib/storage";
import { Prisma } from "../../../../prisma/generated-client";
import { buildShopDedupeKey, normalizeExternalId, normalizeShopNameKey, isShopNameMatch } from "@/lib/shopIdentity";

export const dynamic = "force-dynamic";

function toBooleanFilter(value: string | null) {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function buildStatusWhere(status: string): Prisma.AutoPickOrderWhereInput | undefined {
  const value = String(status || "").trim();
  if (!value) return undefined;

  switch (value) {
    case "已取消":
      return {
        OR: [
          { status: { contains: "取消", mode: "insensitive" } },
          { status: { contains: "退款", mode: "insensitive" } },
          { status: { contains: "关闭", mode: "insensitive" } },
          { status: { equals: "cancel", mode: "insensitive" } },
          { status: { equals: "cancelled", mode: "insensitive" } },
          { status: { equals: "canceled", mode: "insensitive" } },
          { status: { equals: "closed", mode: "insensitive" } },
          { status: { equals: "refund", mode: "insensitive" } },
        ],
      };
    case "已删除":
      return {
        OR: [
          { status: { contains: "删除", mode: "insensitive" } },
          { status: { equals: "delete", mode: "insensitive" } },
          { status: { equals: "deleted", mode: "insensitive" } },
        ],
      };
    case "已完成":
      return {
        OR: [
          { status: { contains: "已完成", mode: "insensitive" } },
          { status: { equals: "done", mode: "insensitive" } },
          { status: { equals: "completed", mode: "insensitive" } },
          { status: { equals: "complete", mode: "insensitive" } },
          { status: { equals: "finished", mode: "insensitive" } },
          { status: { equals: "finish", mode: "insensitive" } },
        ],
      };
    case "配送中":
      return {
        OR: [
          { status: { contains: "配送中", mode: "insensitive" } },
          { status: { equals: "delivering", mode: "insensitive" } },
        ],
      };
    case "待配送":
      return {
        OR: [
          { status: { contains: "待配送", mode: "insensitive" } },
          { status: { contains: "待发货", mode: "insensitive" } },
          { status: { contains: "待送达", mode: "insensitive" } },
          { status: { contains: "待骑手", mode: "insensitive" } },
          { status: { contains: "立即送达", mode: "insensitive" } },
          { status: { contains: "尽快送达", mode: "insensitive" } },
          { status: { contains: "立即配送", mode: "insensitive" } },
          { status: { contains: "商家自配", mode: "insensitive" } },
          { status: { equals: "pending_delivery", mode: "insensitive" } },
          { status: { equals: "pendingdelivery", mode: "insensitive" } },
        ],
      };
    case "已拣货":
      return {
        OR: [
          { status: { contains: "已拣货", mode: "insensitive" } },
          { status: { contains: "拣货中", mode: "insensitive" } },
        ],
      };
    case "待处理":
      return {
        OR: [
          { status: { contains: "待处理", mode: "insensitive" } },
          { status: { contains: "新订单", mode: "insensitive" } },
          { status: { contains: "待接单", mode: "insensitive" } },
          { status: { contains: "商家处理中", mode: "insensitive" } },
          { status: { equals: "pending", mode: "insensitive" } },
          { status: { equals: "processing", mode: "insensitive" } },
        ],
      };
    case "同步中":
      return {
        OR: [
          { status: null },
          { status: "" },
        ],
      };
    default:
      return { status: value };
  }
}

type MatchedCatalogProduct = {
  id: string;
  name: string;
  sku?: string | null;
  jdSkuId?: string | null;
  image?: string | null;
  sourceType: "product" | "shopProduct";
  shopId?: string | null;
  shopName?: string | null;
  isManual?: boolean;
};

type UserPermissionsPayload = {
  autoPickIntegration?: unknown;
};

type AutoPickSystemMeta = {
  resolvedShop?: {
    id?: string;
    name?: string;
  };
  manualAmountOverride?: {
    expectedIncome?: number | null;
    updatedAt?: string;
    updatedBy?: string;
  };
};

function toAutoPickBaseProductName(value: string | null | undefined) {
  return String(value || "")
    .split(/[|｜]/, 1)[0]
    .trim();
}

function toNormalizedText(value: string | null | undefined) {
  return toAutoPickBaseProductName(value)
    .trim()
    .replace(/[（(].*?[)）]/g, " ")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function normalizeSkuDigits(value: string | null | undefined) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) {
    return "";
  }

  const compact = raw.replace(/\s+/g, "");
  const digitsOnly = compact.replace(/\D+/g, "");
  if (digitsOnly) {
    return digitsOnly;
  }

  return compact.replace(/[^A-Z0-9]+/g, "");
}

function buildSkuMatchCandidates(value: string | null | undefined) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return [];
  }

  const segments = rawValue
    .split("+")
    .map((segment) => segment.trim())
    .filter(Boolean);

  const sourceSegments = segments.length > 0 ? segments : [rawValue];
  return Array.from(new Set(sourceSegments.flatMap((segment) => {
    const normalizedSku = normalizeSkuDigits(segment);
    return [
      segment,
      normalizedSku,
      normalizedSku ? `B${normalizedSku}` : "",
    ].filter(Boolean);
  })));
}

function splitCompositeSkuSegments(value: string | null | undefined) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(/[+＋]/)
    .map((segment) => normalizeSkuDigits(segment))
    .filter(Boolean);
}

function readExpectedIncomeFromRawPayload(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }
  const value = Number((rawPayload as Record<string, unknown>).expectedIncome);
  return Number.isFinite(value) ? value : null;
}

function readAutoPickSystemMeta(rawPayload: unknown): AutoPickSystemMeta | null {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const record = rawPayload as Record<string, unknown>;
  const candidate = record.systemMeta;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  return candidate as AutoPickSystemMeta;
}

function readManualAmountOverride(rawPayload: unknown) {
  const systemMeta = readAutoPickSystemMeta(rawPayload);
  const candidate = systemMeta?.manualAmountOverride;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  const expectedIncome = Number(candidate.expectedIncome);
  const updatedAt = String(candidate.updatedAt || "").trim() || null;
  const updatedBy = String(candidate.updatedBy || "").trim() || null;

  if (!Number.isFinite(expectedIncome)) {
    return null;
  }

  return {
    expectedIncome: Math.round(expectedIncome),
    updatedAt,
    updatedBy,
  };
}

function readResolvedAutoPickShop(rawPayload: unknown) {
  const systemMeta = readAutoPickSystemMeta(rawPayload);
  const resolvedShop = systemMeta?.resolvedShop;
  if (!resolvedShop || typeof resolvedShop !== "object") {
    return null;
  }

  const id = String(resolvedShop.id || "").trim();
  const name = String(resolvedShop.name || "").trim();
  if (!id && !name) {
    return null;
  }

  return {
    id: id || null,
    name: name || null,
  };
}

function readManualMatchedProduct(rawPayload: unknown): MatchedCatalogProduct | null {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const candidate = (rawPayload as Record<string, unknown>).manualMatchedProduct;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  const id = String(record.id || "").trim();
  const name = String(record.name || "").trim();
  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    sku: String(record.sku || "").trim() || null,
    image: String(record.image || "").trim() || null,
    sourceType: record.sourceType === "shopProduct" ? "shopProduct" : "product",
    shopName: String(record.shopName || "").trim() || null,
    isManual: true,
  };
}

function isJDPlatform(platform: string | null | undefined) {
  const normalized = String(platform || "").trim().toLowerCase();
  return normalized === "jd" || normalized.includes("jingdong") || normalized.includes("jddj") || normalized.includes("京东");
}

function normalizeShopProductSkuForPlatformMatch(
  platform: string | null | undefined,
  item: { sku?: string | null; jdSkuId?: string | null }
) {
  if (isJDPlatform(platform)) {
    return normalizeSkuDigits(item.jdSkuId || item.sku);
  }
  return normalizeSkuDigits(item.sku || item.jdSkuId);
}

function findMappedShopNameFromIntegrationConfig(
  maiyatianShopId: string | null,
  rawShopName: string | null,
  rawShopAddress: string | null,
  permissions: unknown
) {
  const record = permissions && typeof permissions === "object" && !Array.isArray(permissions)
    ? permissions as UserPermissionsPayload
    : {};
  const config = normalizeAutoPickIntegrationConfig(record.autoPickIntegration);

  if (config.maiyatianShopMappings.length === 0) {
    return null;
  }

  const normalizedShopId = normalizeExternalId(maiyatianShopId);
  if (normalizedShopId) {
    const matchedById = config.maiyatianShopMappings.find((item) => String(item.maiyatianShopId || "").trim() === normalizedShopId);
    if (matchedById?.localShopName) {
      return matchedById.localShopName;
    }
  }

  const matchedByIdentity = config.maiyatianShopMappings.find((item) => {
    const mappingKey = buildShopDedupeKey({
      name: item.maiyatianShopName,
      address: item.maiyatianShopAddress,
    });
    const targetKey = buildShopDedupeKey({
      name: rawShopName,
      address: rawShopAddress,
    });
    if (mappingKey && mappingKey === targetKey) {
      return true;
    }
    return normalizeShopNameKey(item.maiyatianShopName) === normalizeShopNameKey(rawShopName);
  });
  return matchedByIdentity?.localShopName || null;
}

function resolveMappedShopDebug(
  maiyatianShopId: string | null,
  rawShopName: string | null,
  rawShopAddress: string | null,
  permissions: unknown
) {
  const record = permissions && typeof permissions === "object" && !Array.isArray(permissions)
    ? permissions as UserPermissionsPayload
    : {};
  const config = normalizeAutoPickIntegrationConfig(record.autoPickIntegration);
  const normalizedShopId = normalizeExternalId(maiyatianShopId);
  const targetKey = buildShopDedupeKey({
    name: rawShopName,
    address: rawShopAddress,
  });

  const matchedById = normalizedShopId
    ? config.maiyatianShopMappings.find((item) => String(item.maiyatianShopId || "").trim() === normalizedShopId)
    : null;
  if (matchedById?.localShopName) {
    return {
      localShopName: matchedById.localShopName,
      matchedBy: "shopId" as const,
      mappingCount: config.maiyatianShopMappings.length,
      mappingPreview: config.maiyatianShopMappings.slice(0, 10).map((item) => ({
        maiyatianShopId: item.maiyatianShopId,
        maiyatianShopName: item.maiyatianShopName,
        localShopName: item.localShopName,
      })),
    };
  }

  const matchedByIdentity = config.maiyatianShopMappings.find((item) => {
    const mappingKey = buildShopDedupeKey({
      name: item.maiyatianShopName,
      address: item.maiyatianShopAddress,
    });
    if (mappingKey && mappingKey === targetKey) {
      return true;
    }
    return normalizeShopNameKey(item.maiyatianShopName) === normalizeShopNameKey(rawShopName);
  });

  return {
    localShopName: matchedByIdentity?.localShopName || null,
    matchedBy: matchedByIdentity?.localShopName
      ? (buildShopDedupeKey({
          name: matchedByIdentity.maiyatianShopName,
          address: matchedByIdentity.maiyatianShopAddress,
        }) === targetKey ? "shopDedupeKey" as const : "shopName" as const)
      : null,
    mappingCount: config.maiyatianShopMappings.length,
    mappingPreview: config.maiyatianShopMappings.slice(0, 10).map((item) => ({
      maiyatianShopId: item.maiyatianShopId,
      maiyatianShopName: item.maiyatianShopName,
      localShopName: item.localShopName,
    })),
  };
}

function resolveIncomeMetrics(
  platform: string | null | undefined,
  expectedIncome: number | null,
  actualPaid: number,
  fallbackCommission: number,
  options?: { preferExplicitExpectedIncome?: boolean }
) {
  if (options?.preferExplicitExpectedIncome && Number.isFinite(Number(expectedIncome))) {
    const resolvedExpectedIncome = Math.round(Number(expectedIncome));
    return {
      expectedIncome: resolvedExpectedIncome,
      platformCommission: Math.round(resolvedExpectedIncome - Number(actualPaid || 0)),
    };
  }

  if (isJDPlatform(platform)) {
    const settledBase = Math.max(0, Math.round(Number(actualPaid || 0) - 100));
    const platformCommission = Math.max(0, Math.round(settledBase * 0.06));
    const resolvedExpectedIncome = Math.max(0, settledBase - platformCommission);
    return {
      expectedIncome: resolvedExpectedIncome,
      platformCommission,
    };
  }

  if (Number.isFinite(Number(expectedIncome))) {
    const resolvedExpectedIncome = Math.round(Number(expectedIncome));
    return {
      expectedIncome: resolvedExpectedIncome,
      platformCommission: Math.round(resolvedExpectedIncome - Number(actualPaid || 0)),
    };
  }

  return {
    expectedIncome: null,
    platformCommission: Math.round(Number(fallbackCommission || 0)),
  };
}

function readShopNameFromRawPayload(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }
  const record = rawPayload as Record<string, unknown>;
  const extend = record.extend && typeof record.extend === "object" && !Array.isArray(record.extend)
    ? record.extend as Record<string, unknown>
    : null;
  const candidates = [
    record.rawShopName,
    extend?.channel_name,
    record.channel_name,
    record.shop_name,
    record.shopName,
    record.storeName,
    record.merchantName,
    record.merchant_name,
  ];
  for (const item of candidates) {
    const value = String(item || "").trim();
    if (value) {
      return value;
    }
  }
  return null;
}

function readShopAddressFromRawPayload(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }
  const record = rawPayload as Record<string, unknown>;
  const candidates = [
    record.rawShopAddress,
    record.shopAddress,
    record.storeAddress,
    record.merchantAddress,
    record.channelAddress,
    record.store_address,
    record.merchant_address,
    record.channel_address,
  ];
  for (const item of candidates) {
    const value = String(item || "").trim();
    if (value) {
      return value;
    }
  }
  return null;
}

function readShopIdFromRawPayload(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }
  const record = rawPayload as Record<string, unknown>;
  const delivery = record.delivery && typeof record.delivery === "object" && !Array.isArray(record.delivery)
    ? record.delivery as Record<string, unknown>
    : null;
  const candidates = [
    record.shop_id,
    delivery?.shop_id,
  ];
  for (const item of candidates) {
    const value = String(item || "").trim();
    if (value) {
      return value;
    }
  }
  return null;
}

function readDeliveryTimeRangeFromRawPayload(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }
  const record = rawPayload as Record<string, unknown>;
  const value = String(
    record.deliveryTimeRange
    || record.delivery_time_range
    || record.delivery_time_format
    || record.deliveryTimeFormat
    || ""
  ).trim();
  return value || null;
}

function readIsSubscribeFromRawPayload(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return false;
  }
  const record = rawPayload as Record<string, unknown>;
  const rawValue = record.is_subscribe ?? record.isSubscribe;
  if (rawValue === true || rawValue === 1 || rawValue === "1") {
    return true;
  }
  return false;
}

function readCompletedAtFromRawPayload(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const record = rawPayload as Record<string, unknown>;
  const delivery = record.delivery && typeof record.delivery === "object" && !Array.isArray(record.delivery)
    ? record.delivery as Record<string, unknown>
    : null;

  const directTimestamp = Number(
    delivery?.finished_time
    ?? record.finished_time
    ?? record.finishedTime
    ?? record.completedAt
    ?? 0
  );

  if (Number.isFinite(directTimestamp) && directTimestamp > 0) {
    return new Date(directTimestamp * 1000).toISOString();
  }

  const directText = String(record.completedAt || record.finished_time || record.finishedTime || "").trim();
  if (directText && /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(directText)) {
    return directText.replace(" ", "T");
  }

  return null;
}

function readMainSystemSelfDeliveryFlag(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return false;
  }

  const systemMeta = (rawPayload as Record<string, unknown>).systemMeta;
  if (!systemMeta || typeof systemMeta !== "object" || Array.isArray(systemMeta)) {
    return false;
  }

  const marker = (systemMeta as Record<string, unknown>).mainSystemSelfDelivery;
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) {
    return false;
  }

  return Boolean((marker as Record<string, unknown>).triggered);
}

function readAutoOutboundMeta(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return {
      status: null,
      error: null,
      attemptedAt: null,
      resolvedAt: null,
    };
  }

  const systemMeta = (rawPayload as Record<string, unknown>).systemMeta;
  if (!systemMeta || typeof systemMeta !== "object" || Array.isArray(systemMeta)) {
    return {
      status: null,
      error: null,
      attemptedAt: null,
      resolvedAt: null,
    };
  }

  const autoOutbound = (systemMeta as Record<string, unknown>).autoOutbound;
  if (!autoOutbound || typeof autoOutbound !== "object" || Array.isArray(autoOutbound)) {
    return {
      status: null,
      error: null,
      attemptedAt: null,
      resolvedAt: null,
    };
  }

  return {
    status: String((autoOutbound as Record<string, unknown>).status || "").trim() || null,
    error: String((autoOutbound as Record<string, unknown>).error || "").trim() || null,
    attemptedAt: String((autoOutbound as Record<string, unknown>).attemptedAt || "").trim() || null,
    resolvedAt: String((autoOutbound as Record<string, unknown>).resolvedAt || "").trim() || null,
  };
}

function readDeliveryFee(delivery: unknown) {
  if (!delivery || typeof delivery !== "object" || Array.isArray(delivery)) {
    return 0;
  }
  const value = Number((delivery as Record<string, unknown>).sendFee || 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

type ParsedOutboundCostSnapshot = {
  quantity: number;
  totalCost: number;
  averageUnitCost: number;
  batches: Array<{
    purchaseOrderItemId: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
  }>;
};

function parseOutboundCostSnapshot(value: unknown): ParsedOutboundCostSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const batches = Array.isArray(raw.batches)
    ? raw.batches
        .map((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return null;
          }
          const batch = entry as Record<string, unknown>;
          const purchaseOrderItemId = String(batch.purchaseOrderItemId || "").trim();
          const quantity = Number(batch.quantity || 0);
          const unitCost = Number(batch.unitCost || 0);
          const totalCost = Number(batch.totalCost || 0);
          if (!purchaseOrderItemId || !Number.isFinite(quantity) || quantity <= 0) {
            return null;
          }
          return {
            purchaseOrderItemId,
            quantity,
            unitCost: Number.isFinite(unitCost) ? unitCost : 0,
            totalCost: Number.isFinite(totalCost) ? totalCost : 0,
          };
        })
        .filter((entry): entry is ParsedOutboundCostSnapshot["batches"][number] => Boolean(entry))
    : [];
  const quantity = Number(raw.quantity || 0);
  const totalCost = Number(raw.totalCost || 0);
  const averageUnitCost = Number(raw.averageUnitCost || 0);
  return {
    quantity: Number.isFinite(quantity) ? quantity : 0,
    totalCost: Number.isFinite(totalCost) ? totalCost : 0,
    averageUnitCost: Number.isFinite(averageUnitCost) ? averageUnitCost : 0,
    batches,
  };
}

function roundCurrency(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 100) / 100;
}

export async function GET(request: NextRequest) {
  const perf = createRequestPerfTracker(request);
  const session = await getAuthorizedUser("order:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const storage = await getStorageStrategy();
    const searchParams = request.nextUrl.searchParams;
    const liteMode = searchParams.get("_lite") === "1";
    const includeMetrics = !liteMode && searchParams.get("_metrics") === "1";
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") || 20)));
    const query = String(searchParams.get("query") || "").trim();
    const platform = String(searchParams.get("platform") || "").trim();
    const status = String(searchParams.get("status") || "").trim();
    const startDate = String(searchParams.get("startDate") || "").trim();
    const endDate = String(searchParams.get("endDate") || "").trim();
    const hasDelivery = toBooleanFilter(searchParams.get("hasDelivery"));
    const mainSystemSelfDelivery = toBooleanFilter(searchParams.get("mainSystemSelfDelivery"));

    const shopFilter = String(searchParams.get("shop") || "").trim();
    let shopWhereFilter: Prisma.AutoPickOrderWhereInput | undefined = undefined;
    if (shopFilter && shopFilter !== "all") {
      const targetShop = await prisma.shop.findFirst({
        where: {
          userId: session.id,
          name: shopFilter,
        },
        select: { id: true },
      });
      const shopClauses: Prisma.AutoPickOrderWhereInput[] = [
        { rawPayload: { path: ["systemMeta", "resolvedShop", "name"], equals: shopFilter } },
      ];
      if (targetShop?.id) {
        shopClauses.unshift({ shopId: targetShop.id });
        shopClauses.push({ rawPayload: { path: ["systemMeta", "resolvedShop", "id"], equals: targetShop.id } });
      }
      shopWhereFilter = { OR: shopClauses };
    }

    const baseWhere: Prisma.AutoPickOrderWhereInput = {
      userId: session.id,
      ...(shopWhereFilter || {}),
      ...(startDate || endDate ? {
        orderTime: {
          ...(startDate ? { gte: parseAsShanghaiTime(startDate) } : {}),
          ...(endDate ? { lte: parseAsShanghaiTime(`${endDate} 23:59:59`) } : {}),
        },
      } : {}),
      ...(query ? {
        OR: [
          { orderNo: { contains: query, mode: "insensitive" as const } },
          { userAddress: { contains: query, mode: "insensitive" as const } },
          { platform: { contains: query, mode: "insensitive" as const } },
          { sourceId: { contains: query, mode: "insensitive" as const } },
          {
            items: {
              some: {
                OR: [
                  { productName: { contains: query, mode: "insensitive" as const } },
                  { productNo: { contains: query, mode: "insensitive" as const } },
                ],
              },
            },
          },
        ],
      } : {}),
      ...(hasDelivery === true ? { delivery: { not: Prisma.AnyNull } } : {}),
      ...(hasDelivery === false ? { delivery: { equals: Prisma.DbNull } } : {}),
      ...(mainSystemSelfDelivery === true ? { rawPayload: { path: ["systemMeta", "mainSystemSelfDelivery", "triggered"], equals: true } } : {}),
      ...(mainSystemSelfDelivery === false ? {
        NOT: {
          rawPayload: { path: ["systemMeta", "mainSystemSelfDelivery", "triggered"], equals: true },
        },
      } : {}),
    };

    const where: Prisma.AutoPickOrderWhereInput = {
      ...baseWhere,
      ...(platform ? { platform } : {}),
      ...(buildStatusWhere(status) || {}),
    };

    const platformFilterWhere: Prisma.AutoPickOrderWhereInput = {
      ...baseWhere,
      ...(buildStatusWhere(status) || {}),
    };

    const statusFilterWhere: Prisma.AutoPickOrderWhereInput = {
      ...baseWhere,
      ...(platform ? { platform } : {}),
    };

    const cancelledWhere = buildStatusWhere("已取消");

    const [orders, total, platformRows, statusRows, userProfile, cancelledTotal, brushTotal, summaryOrders] = await Promise.all([
      prisma.autoPickOrder.findMany({
        where,
        select: {
          id: true,
          userId: true,
          sourceId: true,
          shopId: true,
          deliveryId: true,
          city: true,
          platform: true,
          dailyPlatformSequence: true,
          orderNo: true,
          orderTime: true,
          userAddress: true,
          shopAddress: true,
          longitude: true,
          latitude: true,
          status: true,
          deliveryDeadline: true,
          deliveryTimeRange: true,
          distanceKm: true,
          distanceIsLinear: true,
          actualPaid: true,
          expectedIncome: true,
          platformCommission: true,
          delivery: true,
          rawPayload: true,
          lastSyncedAt: true,
          autoCompleteAt: true,
          createdAt: true,
          updatedAt: true,
          items: {
            orderBy: { createdAt: "asc" },
          },
          autoCompleteJob: {
            select: {
              status: true,
              lastError: true,
              attempts: true,
              completedAt: true,
            },
          },
        },
        orderBy: [
          { orderTime: "desc" },
          { createdAt: "desc" },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.autoPickOrder.count({ where }),
      liteMode
        ? Promise.resolve([])
        : prisma.autoPickOrder.findMany({
            where: platformFilterWhere,
            distinct: ["platform"],
            select: { platform: true },
            orderBy: { platform: "asc" },
          }),
      liteMode
        ? Promise.resolve([])
        : prisma.autoPickOrder.findMany({
            where: {
              ...statusFilterWhere,
              NOT: { status: null },
            },
            distinct: ["status"],
            select: { status: true },
            orderBy: { status: "asc" },
          }),
      prisma.user.findUnique({
        where: { id: session.id },
        select: {
          permissions: true,
          shippingAddresses: true,
        },
      }),
      !includeMetrics
        ? Promise.resolve(0)
        : prisma.autoPickOrder.count({
            where: {
              ...where,
              ...(cancelledWhere || {}),
            },
          }),
      !includeMetrics
        ? Promise.resolve(0)
        : prisma.autoPickOrder.count({
            where: {
              ...where,
              ...(cancelledWhere ? { NOT: cancelledWhere } : {}),
              rawPayload: { path: ["systemMeta", "mainSystemSelfDelivery", "triggered"], equals: true },
            },
          }),
      !includeMetrics
        ? Promise.resolve([])
        : prisma.autoPickOrder.findMany({
            where,
            select: {
              platform: true,
              status: true,
              actualPaid: true,
              expectedIncome: true,
              platformCommission: true,
              delivery: true,
              items: {
                select: {
                  quantity: true,
                },
              },
            },
          }),
    ]);
    perf.lap("core-queries");

    const outboundNoteNeedles = orders
      .map((order) => String(order.orderNo || "").trim())
      .filter(Boolean)
      .map((orderNo) => `平台单号: ${orderNo}`);

    const outboundRows = outboundNoteNeedles.length > 0
      ? await prisma.outboundOrder.findMany({
          where: {
            userId: session.id,
            OR: outboundNoteNeedles.map((needle) => ({
              note: { contains: needle, mode: "insensitive" as const },
            })),
          },
          select: {
            id: true,
            note: true,
            items: {
              select: {
                id: true,
                productId: true,
                shopProductId: true,
                quantity: true,
                costSnapshot: true,
                shopProduct: {
                  select: {
                    productName: true,
                    costPrice: true,
                  },
                },
                product: {
                  select: {
                    name: true,
                    costPrice: true,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        })
      : [];
    perf.lap("outbound-lookup");

    const userAddresses = userProfile && Array.isArray(userProfile.shippingAddresses)
      ? userProfile.shippingAddresses as Array<Record<string, unknown>>
      : [];
    const shopRateMap = new Map<string, number>();
    userAddresses.forEach((addr) => {
      const label = String(addr.label || "").trim();
      if (label && typeof addr.serviceFeeRate === "number") {
        shopRateMap.set(label, addr.serviceFeeRate);
      }
    });

    const outboundByOrderNo = new Map<string, {
      id: string;
      productCost: number;
      missingCostItemCount: number;
      firstMissingCostShopProductId: string | null;
      firstMissingCostPurchaseOrderId: string | null;
      firstMissingCostPurchaseOrderItemId: string | null;
      breakdown: Array<{
        name: string;
        quantity: number;
        unitCost: number;
        totalCost: number;
        shopProductId: string | null;
      }>;
    }>();
    const purchaseOrderItemIds = Array.from(new Set(
      outboundRows.flatMap((outbound) => outbound.items.flatMap((item) => {
        const snapshot = parseOutboundCostSnapshot(item.costSnapshot);
        return snapshot?.batches.map((batch) => String(batch.purchaseOrderItemId || "").trim()).filter(Boolean) || [];
      }))
    ));
    const purchaseOrderItems = purchaseOrderItemIds.length > 0
      ? await prisma.purchaseOrderItem.findMany({
          where: {
            id: { in: purchaseOrderItemIds },
          },
          select: {
            id: true,
            purchaseOrderId: true,
          },
        })
      : [];
    const purchaseOrderIdByItemId = new Map(
      purchaseOrderItems.map((item) => [item.id, item.purchaseOrderId] as const)
    );

    // 查询所有相关出库商品的可用采购批次列表，供后续回填补录参考
    const allOutboundProductIds = Array.from(new Set(
      outboundRows.flatMap((outbound) => outbound.items.map((item) => String(item.productId || "").trim()).filter(Boolean))
    ));
    const allOutboundShopProductIds = Array.from(new Set(
      outboundRows.flatMap((outbound) => outbound.items.map((item) => String(item.shopProductId || "").trim()).filter(Boolean))
    ));

    const availablePurchaseItems = (allOutboundProductIds.length > 0 || allOutboundShopProductIds.length > 0)
      ? await prisma.purchaseOrderItem.findMany({
          where: {
            purchaseOrder: {
              userId: session.id,
              status: "Received",
            },
            remainingQuantity: { gt: 0 },
            OR: [
              ...(allOutboundProductIds.length > 0 ? [{ productId: { in: allOutboundProductIds } }] : []),
              ...(allOutboundShopProductIds.length > 0 ? [{ shopProductId: { in: allOutboundShopProductIds } }] : []),
            ],
          },
          select: {
            id: true,
            purchaseOrderId: true,
            productId: true,
            shopProductId: true,
            quantity: true,
            remainingQuantity: true,
            costPrice: true,
            purchaseOrder: {
              select: {
                date: true,
              },
            },
          },
          orderBy: {
            purchaseOrder: {
              date: "asc",
            },
          },
        })
      : [];

    const availableBatchesByProduct = new Map<string, Array<{
      purchaseOrderItemId: string;
      purchaseOrderId: string | null;
      quantity: number;
      remainingQuantity: number;
      costPrice: number;
      date: string | null;
    }>>();

    const availableBatchesByShopProduct = new Map<string, Array<{
      purchaseOrderItemId: string;
      purchaseOrderId: string | null;
      quantity: number;
      remainingQuantity: number;
      costPrice: number;
      date: string | null;
    }>>();

    availablePurchaseItems.forEach((poi) => {
      const item = {
        purchaseOrderItemId: poi.id,
        purchaseOrderId: poi.purchaseOrderId,
        quantity: poi.quantity,
        remainingQuantity: poi.remainingQuantity || 0,
        costPrice: poi.costPrice,
        date: poi.purchaseOrder?.date ? poi.purchaseOrder.date.toISOString() : null,
      };

      if (poi.shopProductId) {
        const list = availableBatchesByShopProduct.get(poi.shopProductId) || [];
        list.push(item);
        availableBatchesByShopProduct.set(poi.shopProductId, list);
      }
      if (poi.productId) {
        const list = availableBatchesByProduct.get(poi.productId) || [];
        list.push(item);
        availableBatchesByProduct.set(poi.productId, list);
      }
    });

    for (const outbound of outboundRows) {
      const note = String(outbound.note || "");
      const match = note.match(/平台单号:\s*([^\s|]+)/);
      const orderNo = String(match?.[1] || "").trim();
      if (orderNo && !outboundByOrderNo.has(orderNo)) {
        let missingCostItemCount = 0;
        let firstMissingCostShopProductId: string | null = null;
        let firstMissingCostPurchaseOrderId: string | null = null;
        let firstMissingCostPurchaseOrderItemId: string | null = null;
        const rawBreakdown = outbound.items.map((item) => {
          const snapshot = parseOutboundCostSnapshot(item.costSnapshot);
          const unitCost = snapshot
            ? Number(snapshot.averageUnitCost || 0)
            : (Number(item.shopProduct?.costPrice) || 0);
          const quantity = Math.max(0, Number(item.quantity || 0));
          const totalCost = snapshot
            ? Number(snapshot.totalCost || 0)
            : (Math.round(unitCost * 100) * quantity) / 100;
          const shopProductId = String(item.shopProductId || "").trim() || null;
          const productId = String(item.productId || "").trim() || null;

          const batches = (snapshot?.batches || []).map((batch) => {
            const purchaseOrderItemId = batch.purchaseOrderItemId;
            const purchaseOrderId = purchaseOrderIdByItemId.get(purchaseOrderItemId) || null;
            return {
              ...batch,
              purchaseOrderId,
            };
          });

          const availableBatches = (shopProductId ? availableBatchesByShopProduct.get(shopProductId) : null)
            || (productId ? availableBatchesByProduct.get(productId) : null)
            || [];

          if (unitCost <= 0) {
            missingCostItemCount += 1;
            if (!firstMissingCostShopProductId) {
              firstMissingCostShopProductId = shopProductId;
            }
            if (!firstMissingCostPurchaseOrderItemId) {
              const purchaseOrderItemId = String(
                snapshot?.batches.find((batch) => String(batch.purchaseOrderItemId || "").trim())?.purchaseOrderItemId || ""
              ).trim();
              if (purchaseOrderItemId) {
                firstMissingCostPurchaseOrderItemId = purchaseOrderItemId;
                firstMissingCostPurchaseOrderId = purchaseOrderIdByItemId.get(purchaseOrderItemId) || null;
              }
            }
          }
          return {
            outboundOrderItemId: item.id,
            name: String(item.shopProduct?.productName || item.product?.name || "未命名商品").trim() || "未命名商品",
            quantity,
            unitCost: roundCurrency(unitCost),
            totalCost: roundCurrency(totalCost),
            shopProductId,
            productId,
            batches,
            availableBatches,
          };
        });
        const productCost = outbound.items.reduce((sum, item) => {
          const snapshot = parseOutboundCostSnapshot(item.costSnapshot);
          const unitCost = snapshot
            ? Number(snapshot.totalCost || 0)
            : (Number(item.shopProduct?.costPrice) || 0);
          const quantity = Math.max(0, Number(item.quantity || 0));
          return sum + (snapshot ? Math.round(unitCost * 100) : Math.round(unitCost * 100) * quantity);
        }, 0);
        const rawBreakdownTotal = roundCurrency(
          rawBreakdown.reduce((sum, item) => sum + (Number(item.totalCost || 0) || 0), 0)
        );
        const shouldScaleBreakdown = rawBreakdownTotal > 0
          && Math.abs(productCost - rawBreakdownTotal * 100) < 0.01;
        const breakdown = shouldScaleBreakdown
          ? rawBreakdown.map((item) => ({
              ...item,
              unitCost: roundCurrency(item.unitCost * 100),
              totalCost: roundCurrency(item.totalCost * 100),
            }))
          : rawBreakdown;
        outboundByOrderNo.set(orderNo, {
          id: outbound.id,
          productCost,
          missingCostItemCount,
          firstMissingCostShopProductId,
          firstMissingCostPurchaseOrderId,
          firstMissingCostPurchaseOrderItemId,
          breakdown,
        });
      }
    }

    const summary = !includeMetrics
      ? null
      : summaryOrders.reduce((acc, order) => {
          const expectedIncome = order.expectedIncome;
          const metrics = resolveIncomeMetrics(order.platform, expectedIncome, order.actualPaid, order.platformCommission);
          const cancelled = isAutoPickOrderCancelledStatus(order.status);
          if (!cancelled) {
            acc.receivedAmount += Math.max(0, Number(metrics.expectedIncome || 0));
            acc.platformCommission += metrics.platformCommission;
            acc.validOrderCount += 1;
          }
          acc.itemCount += order.items.reduce((sum: number, item) => sum + item.quantity, 0);
          acc.totalDeliveryFee += readDeliveryFee(order.delivery);
          return acc;
        }, {
          receivedAmount: 0,
          platformCommission: 0,
          validOrderCount: 0,
          itemCount: 0,
          totalDeliveryFee: 0,
        });
    const overview = !includeMetrics
      ? null
      : {
          totalCount: total,
          cancelledCount: cancelledTotal,
          brushCount: brushTotal,
          trueOrderCount: Math.max(0, total - cancelledTotal - brushTotal),
        };

    const productNames = Array.from(new Set(
      orders.flatMap((order) => order.items.map((item) => String(item.productName || "").trim()).filter(Boolean))
    ));
    const productSkuCandidates = Array.from(new Set(
      orders.flatMap((order) => order.items.flatMap((item) => {
        return buildSkuMatchCandidates(item.productNo);
      }))
    ));

    const shopProducts = (productNames.length > 0 || productSkuCandidates.length > 0)
      ? await prisma.shopProduct.findMany({
            where: {
              shop: { userId: session.id },
              OR: [
                ...(productNames.length > 0 ? [{ productName: { in: productNames } }] : []),
                ...(productSkuCandidates.length > 0 ? [{ sku: { in: productSkuCandidates } }] : []),
                ...(productSkuCandidates.length > 0 ? [{ jdSkuId: { in: productSkuCandidates } }] : []),
              ],
            },
            select: {
              id: true,
              sku: true,
              jdSkuId: true,
              productName: true,
              productImage: true,
              shop: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          })
      : [];
    perf.lap("shop-product-lookup");

    const mappedShopProducts = shopProducts.map((item) => ({
      id: item.id,
      name: item.productName || "未命名商品",
      sku: item.sku,
      jdSkuId: item.jdSkuId,
      image: item.productImage ? storage.resolveUrl(item.productImage) : null,
      sourceType: "shopProduct" as const,
      shopId: item.shop?.id || null,
      shopName: item.shop?.name || null,
    }));

    const permissionsObj = userProfile?.permissions && typeof userProfile.permissions === "object" && !Array.isArray(userProfile.permissions)
      ? userProfile.permissions as Record<string, unknown>
      : {};
    const integrationConfig = normalizeAutoPickIntegrationConfig(permissionsObj.autoPickIntegration);
    const brushCommission = Math.round((integrationConfig.defaultBrushCommission || 0) * 100);

    const enrichedOrders = orders.map((order) => {
      const manualAmountOverride = readManualAmountOverride(order.rawPayload);
      const actualPaid = order.actualPaid;
      const expectedIncome = manualAmountOverride && Number.isFinite(Number(manualAmountOverride.expectedIncome))
        ? Number(manualAmountOverride.expectedIncome)
        : (typeof order.expectedIncome === "number"
          ? order.expectedIncome
          : readExpectedIncomeFromRawPayload(order.rawPayload));
      const metrics = resolveIncomeMetrics(
        order.platform,
        expectedIncome,
        actualPaid,
        manualAmountOverride
          ? Math.round(Number(expectedIncome || 0) - Number(actualPaid || 0))
          : order.platformCommission,
        { preferExplicitExpectedIncome: Boolean(manualAmountOverride) }
      );
      const deleted = isAutoPickOrderDeletedStatus(order.status);
      const pickup = isAutoPickPickupOrder(order.rawPayload, order.userAddress, order.shopAddress);
      const otherPickup = isAutoPickOtherPickupOrder(order.rawPayload);
      const businessStatus = resolveAutoPickBusinessStatus(order.status, order.rawPayload, order.userAddress, order.shopAddress);
      return {
        ...order,
        shopId: order.shopId || readShopIdFromRawPayload(order.rawPayload),
        shopAddress: order.shopAddress,
        rawShopName: readShopNameFromRawPayload(order.rawPayload) || null,
        rawShopAddress: readShopAddressFromRawPayload(order.rawPayload) || order.shopAddress || null,
        deliveryTimeRange: order.deliveryTimeRange || readDeliveryTimeRangeFromRawPayload(order.rawPayload),
        isMainSystemSelfDelivery: readMainSystemSelfDeliveryFlag(order.rawPayload),
        isPickCompleted: doesAutoPickOrderRequirePickConfirmation(order.platform)
          ? isAutoPickPickCompleted(order.rawPayload)
          : true,
        isPickup: pickup,
        isOtherPickup: otherPickup,
        isDeleted: deleted,
        isSubscribe: readIsSubscribeFromRawPayload(order.rawPayload),
        status: businessStatus || order.status,
        actualPaid,
        expectedIncome: metrics.expectedIncome,
        platformCommission: metrics.platformCommission,
        completedAt: order.autoCompleteJob?.completedAt?.toISOString() || readCompletedAtFromRawPayload(order.rawPayload),
        autoCompleteJobStatus: order.autoCompleteJob?.status || null,
        autoCompleteJobError: order.autoCompleteJob?.lastError || null,
        autoCompleteJobAttempts: order.autoCompleteJob?.attempts ?? null,
      };
    }).map((order) => {
      const lockedResolvedShop = readResolvedAutoPickShop(order.rawPayload);
      const mappingDebug = resolveMappedShopDebug(
        order.shopId,
        order.rawShopName,
        order.rawShopAddress,
        userProfile?.permissions
      );
      const matchedShopId = lockedResolvedShop?.id || null;
      const matchedShopName = String(
        String(lockedResolvedShop?.name || "").trim() || mappingDebug.localShopName || ""
      ).trim();
      const autoOutboundMeta = readAutoOutboundMeta(order.rawPayload);
      const outboundMeta = outboundByOrderNo.get(order.orderNo) || null;
      const serviceFeeRate = order.platform === "线下交易"
        ? 0
        : (shopRateMap.get(matchedShopName) ?? 0.06);
      const productCost = outboundMeta?.productCost || 0;
      const deliveryFee = readDeliveryFee(order.delivery);
      const missingCostItemCount = outboundMeta?.missingCostItemCount || 0;
      const hasOutbound = Boolean(outboundMeta);
      const productCostStatus = !hasOutbound
        ? "pending-outbound" as const
        : missingCostItemCount > 0
          ? "pending-backfill" as const
          : "ready" as const;
      const pureProfit = order.isMainSystemSelfDelivery
        ? - (Math.abs(Number(order.platformCommission || 0)) + brushCommission)
        : (productCostStatus === "ready"
          ? Math.round(Number(order.expectedIncome || 0) * (1 - serviceFeeRate)) - deliveryFee - productCost
          : null);

      return {
        ...order,
        matchedShopId,
        matchedShopName,
        autoOutboundStatus: autoOutboundMeta.status,
        autoOutboundError: autoOutboundMeta.error,
        autoOutboundAttemptedAt: autoOutboundMeta.attemptedAt,
        autoOutboundResolvedAt: autoOutboundMeta.resolvedAt,
        hasOutbound,
        outboundOrderId: outboundMeta?.id || null,
        serviceFeeRate,
        productCost: hasOutbound ? productCost : null,
        productCostBreakdown: outboundMeta?.breakdown || [],
        pureProfit,
        productCostStatus,
        missingCostItemCount,
        firstMissingCostShopProductId: outboundMeta?.firstMissingCostShopProductId || null,
        firstMissingCostPurchaseOrderId: outboundMeta?.firstMissingCostPurchaseOrderId || null,
        firstMissingCostPurchaseOrderItemId: outboundMeta?.firstMissingCostPurchaseOrderItemId || null,
        items: order.items.map((item) => {
          const manualMatchedProduct = readManualMatchedProduct(item.rawPayload);
          const skuSegments = splitCompositeSkuSegments(item.productNo);
          const normalizedSkuCandidates = skuSegments.length > 0
            ? skuSegments
            : [normalizeSkuDigits(item.productNo)].filter(Boolean);
          const candidatesInMatchedShop = mappedShopProducts.filter((product) => (
            matchedShopId
              ? product.shopId === matchedShopId
              : isShopNameMatch(product.shopName, matchedShopName)
          ));
          const resolveStrictSkuMatch = (normalizedSku: string) => {
            if (!normalizedSku) {
              return null;
            }

            const strictCandidates = candidatesInMatchedShop.filter((product) =>
              normalizeShopProductSkuForPlatformMatch(order.platform, product) === normalizedSku
            );

            const uniqueCandidateShopIds = Array.from(new Set(
              strictCandidates
                .map((product) => String(product.shopId || "").trim())
                .filter(Boolean)
            ));

            if (!matchedShopId && uniqueCandidateShopIds.length > 1) {
              return null;
            }

            return strictCandidates[0] || null;
          };
          const strictMatches = normalizedSkuCandidates
            .map((candidate) => resolveStrictSkuMatch(candidate))
            .filter((product): product is typeof mappedShopProducts[number] => Boolean(product));
          const hasStrictMatchForAllSegments = normalizedSkuCandidates.length > 0
            && normalizedSkuCandidates.every((candidate) => Boolean(resolveStrictSkuMatch(candidate)));
          const matchedProduct = manualMatchedProduct || (hasStrictMatchForAllSegments ? (strictMatches[0] || null) : null);
          const displayItems = manualMatchedProduct
            ? undefined
            : normalizedSkuCandidates.length > 1 && hasStrictMatchForAllSegments
            ? normalizedSkuCandidates.map((candidate) => {
                const segmentMatchedProduct = resolveStrictSkuMatch(candidate);
                return {
                  name: segmentMatchedProduct?.name || item.productName || "未命名商品",
                  sku: (
                    isJDPlatform(order.platform)
                      ? (segmentMatchedProduct?.jdSkuId || segmentMatchedProduct?.sku)
                      : (segmentMatchedProduct?.sku || segmentMatchedProduct?.jdSkuId)
                  ) || candidate,
                  image: segmentMatchedProduct?.image || item.thumb || null,
                  quantity: item.quantity,
                };
              })
            : undefined;
          return {
            ...item,
            displayItems,
            matchedProduct,
          };
        }),
      };
    });
    perf.lap("response-build");
    perf.log("GET /api/orders", { page, pageSize, count: orders.length, total });

    return NextResponse.json({
      items: enrichedOrders,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      ...(liteMode ? {} : {
        filters: {
          platforms: platformRows.map((item) => item.platform).filter(Boolean),
          statuses: statusRows.map((item) => item.status).filter((item): item is string => Boolean(item)),
        },
        ...(includeMetrics ? {
          summary,
          overview,
        } : {}),
      }),
    }, {
      headers: perf.headers(),
    });
  } catch (error) {
    console.error("Failed to fetch auto-pick orders:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to fetch orders",
    }, { status: 500 });
  }
}
