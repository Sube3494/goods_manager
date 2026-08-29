import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { hasAdminAccess, hasPermission } from "@/lib/permissions";
import {
  backfillJdSkuIdForManualMatchedShopProducts,
  backfillMeituanSkuIdForManualMatchedShopProducts,
  backfillPlatformIdsForSyncedAutoPickOrder,
  normalizeAutoPickIntegrationConfig,
  readCustomerMaskedPhoneFromRawPayload,
  readCustomerNameFromRawPayload,
  readCustomerPhoneFromRawPayload,
  readCustomerPhoneExtensionFromRawPayload,
  readCustomerRemarkFromRawPayload,
  readRiderPhoneFromDelivery,
  readRiderPhoneFromRawPayload,
  syncMeituanSkuIdForShopProduct,
  syncTaobaoSkuIdForShopProduct,
} from "@/lib/autoPickOrders";
import {
  resolveShopBrushCommission,
} from "@/lib/shopCommission";
import { processDueAutoCompleteJobs } from "@/lib/autoPickAutoComplete";
import { parseAsShanghaiTime } from "@/lib/dateUtils";
import { doesAutoPickOrderRequirePickConfirmation, isAutoPickOrderCancelledStatus, isAutoPickOrderDeletedStatus, isAutoPickOtherPickupOrder, isAutoPickPickCompleted, isAutoPickPickupOrder, resolveAutoPickBusinessStatus } from "@/lib/autoPickOrderStatus";
import { createRequestPerfTracker } from "@/lib/perf";
import { getStorageStrategy } from "@/lib/storage";
import { Prisma } from "../../../../prisma/generated-client";
import { buildShopDedupeKey, normalizeExternalId, normalizeShopNameKey, isShopNameMatch } from "@/lib/shopIdentity";
import { isPrismaMissingColumnError } from "@/lib/prismaSchemaCompat";
import { normalizeMeituanSkuIds } from "@/lib/productMeituanSku";
import {
  getOutboundReturnTotals,
  getOutboundReturnedQuantityMap,
  parseOutboundReturnMeta,
} from "@/lib/outboundReturnMeta";

export const dynamic = "force-dynamic";

type OutboundLookupRow = {
  id: string;
  note: string | null;
  status?: string | null;
  items: Array<{
    id: string;
    productId: string | null;
    shopProductId: string | null;
    quantity: number;
    costSnapshot?: unknown;
    shopProduct: {
      productName: string | null;
      costPrice: number;
      productImage: string | null;
    } | null;
    product: {
      name: string;
      costPrice: number;
      image: string | null;
    } | null;
  }>;
};

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
  productId?: string | null;
  shopProductId?: string | null;
  shopId?: string | null;
  shopName?: string | null;
  isManual?: boolean;
  bundleItems?: any[];
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
    platformCommission?: number | null;
    onlyExpectedIncome?: boolean;
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
  const platformCommission = Number(candidate.platformCommission);
  const updatedAt = String(candidate.updatedAt || "").trim() || null;
  const updatedBy = String(candidate.updatedBy || "").trim() || null;

  if (!Number.isFinite(expectedIncome)) {
    return null;
  }

  return {
    expectedIncome: Math.round(expectedIncome),
    platformCommission: Number.isFinite(platformCommission) ? Math.round(platformCommission) : null,
    onlyExpectedIncome: candidate.onlyExpectedIncome === true,
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

  const payloadObj = rawPayload as Record<string, unknown>;
  if (payloadObj.ignoreOutbound === true || payloadObj.isManualIgnored === true) {
    return {
      id: "__ignored__",
      name: "无需出库（纯取货/跑腿）",
      sku: "-",
      image: null,
      sourceType: "product",
      shopProductId: "__ignored__",
      shopName: null,
      isManual: true,
      ignoreOutbound: true,
    } as any;
  }

  const candidate = payloadObj.manualMatchedProduct;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  const id = String(record.id || "").trim();
  const name = String(record.name || "").trim();
  const sourceType = record.sourceType === "product" ? "product" : "shopProduct";
  const shopProductId = String(record.shopProductId || "").trim() || (sourceType === "shopProduct" ? id : "");
  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    sku: String(record.sku || "").trim() || null,
    image: String(record.image || "").trim() || null,
    sourceType,
    productId: String(record.productId || "").trim() || null,
    shopProductId: shopProductId || id,
    shopName: String(record.shopName || "").trim() || null,
    isManual: true,
    bundleItems: Array.isArray(record.bundleItems) ? record.bundleItems : undefined,
  };
}

function isJDPlatform(platform: string | null | undefined) {
  const normalized = String(platform || "").trim().toLowerCase();
  return normalized === "jd" || normalized.includes("jingdong") || normalized.includes("jddj") || normalized.includes("京东");
}

function isMeituanPlatform(platform: string | null | undefined) {
  const normalized = String(platform || "").trim().toLowerCase();
  return normalized.includes("meituan") || normalized.includes("美团") || normalized.includes("闪购") || normalized.includes("shangou");
}

function isTaobaoPlatform(platform: string | null | undefined) {
  const normalized = String(platform || "").trim().toLowerCase();
  return normalized.includes("淘宝") || normalized.includes("天猫") || normalized === "taobao" || normalized === "ebai";
}

function isDoudianPlatform(platform: string | null | undefined) {
  const normalized = String(platform || "").trim().toLowerCase();
  return normalized.includes("抖店") || normalized.includes("抖音") || normalized === "doudian" || normalized === "douyin";
}

function readGoodsExtraRecord(rawPayload: unknown) {
  const record = rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
    ? rawPayload as Record<string, unknown>
    : {};
  const goodsExtra = record.goods_extra || record.goodsExtra;
  if (typeof goodsExtra === "string") {
    try {
      const parsed = JSON.parse(goodsExtra) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }
  return goodsExtra && typeof goodsExtra === "object" && !Array.isArray(goodsExtra)
    ? goodsExtra as Record<string, unknown>
    : {};
}

function readPlatformProductIdForMatch(
  platform: string | null | undefined,
  rawPayload: unknown,
  productNo?: string | null,
  platformSkuId?: string | null,
) {
  const normalizedPlatformSkuId = normalizeSkuDigits(platformSkuId);
  if (normalizedPlatformSkuId) {
    return normalizedPlatformSkuId;
  }

  if (isMeituanPlatform(platform)) {
    const record = rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
      ? rawPayload as Record<string, unknown>
      : {};
    const goodsExtra = readGoodsExtraRecord(record);
    return normalizeSkuDigits(String(
      goodsExtra.original_sku_id
      || record.source_id
      || record.sourceId
      || productNo
      || ""
    ));
  }

  if (isJDPlatform(platform)) {
    const record = rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
      ? rawPayload as Record<string, unknown>
      : {};
    return normalizeSkuDigits(String(
      record.source_id
      || record.sourceId
      || record.sku_code
      || record.skuCode
      || productNo
      || ""
    ));
  }

  if (isTaobaoPlatform(platform)) {
    const record = rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
      ? rawPayload as Record<string, unknown>
      : {};
    return normalizeSkuDigits(String(
      record.sku_id
      || record.skuId
      || record.source_id
      || record.sourceId
      || productNo
      || ""
    ));
  }

  if (isDoudianPlatform(platform)) {
    const record = rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
      ? rawPayload as Record<string, unknown>
      : {};
    return normalizeSkuDigits(String(
      record.sku_id
      || record.skuId
      || record.source_id
      || record.sourceId
      || record.goods_id
      || record.goodsId
      || productNo
      || ""
    ));
  }

  return "";
}

function readStrictPlatformProductId(
  platform: string | null | undefined,
  rawPayload: unknown,
  platformSkuId?: string | null,
) {
  const normalizedPlatformSkuId = normalizeSkuDigits(platformSkuId);
  if (normalizedPlatformSkuId) {
    return normalizedPlatformSkuId;
  }

  const record = rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
    ? rawPayload as Record<string, unknown>
    : {};

  if (isMeituanPlatform(platform)) {
    const goodsExtra = readGoodsExtraRecord(record);
    return normalizeSkuDigits(String(
      goodsExtra.original_sku_id
      || record.source_id
      || record.sourceId
      || ""
    ));
  }

  if (isTaobaoPlatform(platform)) {
    return normalizeSkuDigits(String(
      record.sku_id
      || record.skuId
      || record.source_id
      || record.sourceId
      || ""
    ));
  }

  if (isDoudianPlatform(platform)) {
    return normalizeSkuDigits(String(
      record.sku_id
      || record.skuId
      || record.source_id
      || record.sourceId
      || record.goods_id
      || record.goodsId
      || ""
    ));
  }

  return "";
}

function normalizeShopProductSkuForPlatformMatch(
  platform: string | null | undefined,
  item: { sku?: string | null; jdSkuId?: string | null; meituanSkuId?: string | null; taobaoSkuId?: string | null; doudianSkuId?: string | null }
) {
  if (isJDPlatform(platform)) {
    return normalizeSkuDigits(item.jdSkuId);
  }
  if (isMeituanPlatform(platform)) {
    return normalizeSkuDigits(item.meituanSkuId);
  }
  if (isTaobaoPlatform(platform)) {
    return normalizeSkuDigits(item.taobaoSkuId);
  }
  if (isDoudianPlatform(platform)) {
    return normalizeSkuDigits(item.doudianSkuId);
  }
  return normalizeSkuDigits(item.sku || item.jdSkuId);
}

function doesShopProductMatchStableKey(
  platform: string | null | undefined,
  item: { sku?: string | null; jdSkuId?: string | null; meituanSkuId?: string | null; taobaoSkuId?: string | null; doudianSkuId?: string | null },
  key: string
) {
  if (!key) {
    return false;
  }
  const normalizedKey = normalizeSkuDigits(key);
  if (!normalizedKey) {
    return false;
  }

  const platformKeys = isMeituanPlatform(platform)
    ? normalizeMeituanSkuIds(item.meituanSkuId).map((value) => normalizeSkuDigits(value))
    : [normalizeShopProductSkuForPlatformMatch(platform, item)];
  const fallbackKeys = [
    normalizeSkuDigits(item.sku),
    normalizeSkuDigits(item.jdSkuId),
    normalizeSkuDigits(item.taobaoSkuId),
    normalizeSkuDigits(item.doudianSkuId),
    ...normalizeMeituanSkuIds(item.meituanSkuId).map((value) => normalizeSkuDigits(value)),
  ].filter(Boolean);

  return platformKeys.includes(normalizedKey) || fallbackKeys.includes(normalizedKey);
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
  const isOffline = platform === "线下交易" || platform === "other";
  if (isOffline) {
    const income = Number.isFinite(Number(expectedIncome)) && Number(expectedIncome) > 0
      ? Math.round(Number(expectedIncome))
      : (Number.isFinite(Number(actualPaid)) && Number(actualPaid) > 0 ? Math.round(Number(actualPaid)) : (Number.isFinite(Number(expectedIncome)) ? Math.round(Number(expectedIncome)) : 0));
    return {
      expectedIncome: income,
      platformCommission: 0,
    };
  }

  if (Number.isFinite(Number(expectedIncome))) {
    const resolvedExpectedIncome = Math.round(Number(expectedIncome));
    const derivedCommission = Math.round(Number(actualPaid || 0) - resolvedExpectedIncome);
    return {
      expectedIncome: resolvedExpectedIncome,
      platformCommission: isJDPlatform(platform) && derivedCommission >= 0
        ? Math.max(derivedCommission, Math.max(0, Math.round(Number(fallbackCommission || 0))))
        : derivedCommission,
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

  return {
    expectedIncome: null,
    platformCommission: Math.max(0, Math.round(Number(fallbackCommission || 0))),
  };
}

function resolveRefundAdjustedIncomeMetrics(options: {
  expectedIncome: number | null | undefined;
  platformCommission: number | null | undefined;
  actualPaid: number | null | undefined;
  refundAmount: number | null | undefined;
}) {
  const expectedIncome = Math.max(0, Number(options.expectedIncome || 0));
  const platformCommission = Number(options.platformCommission || 0);
  const actualPaid = Math.max(0, Number(options.actualPaid || 0));
  const refundAmount = Math.max(0, Number(options.refundAmount || 0));

  if (refundAmount <= 0) {
    return {
      actualPaid,
      expectedIncome,
      platformCommission,
      refundedExpectedIncome: 0,
      refundedCommission: 0,
    };
  }

  // 退款全额直接从商家的到手金额中扣除
  const adjustedExpectedIncome = Math.max(0, expectedIncome - refundAmount);

  return {
    actualPaid,
    expectedIncome: adjustedExpectedIncome,
    platformCommission,
    refundedExpectedIncome: refundAmount,
    refundedCommission: 0,
  };
}

function readRefundAmountFromRawPayload(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return 0;
  const record = rawPayload as Record<string, unknown>;
  return Number(record.refundAmount || record.refund_amount || 0) || 0;
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

function isOfflineManualDeliveryLossOrder(input: {
  platform?: string | null;
  actualPaid?: number | null;
  expectedIncome?: number | null;
  deliveryFee?: number | null;
}) {
  return String(input.platform || "").trim() === "线下交易"
    && Number(input.deliveryFee || 0) > 0
    && Number(input.actualPaid || 0) <= 0
    && Number(input.expectedIncome || 0) <= 0;
}

function isManualDeliveryPlaceholderOrderItem(item: {
  productName?: string | null;
  productNo?: string | null;
  rawPayload?: unknown;
}) {
  const rawPayload = item.rawPayload && typeof item.rawPayload === "object" && !Array.isArray(item.rawPayload)
    ? item.rawPayload as Record<string, unknown>
    : null;
  return String(item.productNo || "").trim() === "__manual_delivery_placeholder__"
    || rawPayload?.isManualDeliveryPlaceholder === true
    || String(item.productName || "").trim() === "手工配送占位商品";
}

function hasAutoPickFulfillmentItems(items: Array<{
  productName?: string | null;
  productNo?: string | null;
  rawPayload?: unknown;
}>) {
  return items.some((item) => {
    if (!isManualDeliveryPlaceholderOrderItem(item)) {
      return true;
    }
    return Boolean(readManualMatchedProduct(item.rawPayload));
  });
}

function normalizeOrderPlatformForSummary(platform?: string | null) {
  const raw = String(platform || "").trim();
  const lower = raw.toLowerCase();
  if (!raw || lower === "other") return "线下交易";
  if (raw.includes("美团") || lower.includes("meituan") || lower === "shangou") return "美团";
  if (raw.includes("京东") || lower.includes("jd") || lower === "daojia") return "京东";
  if (raw.includes("淘宝") || raw.includes("天猫") || lower === "taobao" || lower === "ebai") return "淘宝";
  if (raw.includes("抖店") || raw.includes("抖音") || lower === "doudian" || lower === "douyin") return "抖店";
  return raw;
}

function isRefundableMeituanDelivery(platform: unknown, delivery: unknown) {
  const deliveryObj = delivery && typeof delivery === "object" && !Array.isArray(delivery)
    ? delivery as Record<string, unknown>
    : {};
  const haystack = [
    platform,
    deliveryObj.logisticName,
    deliveryObj.logistic_name,
    deliveryObj.track,
    deliveryObj.deliveryName,
    deliveryObj.delivery_name,
    deliveryObj.deliveryTypeName,
    deliveryObj.delivery_type_name,
  ].map((value) => String(value || "").trim().toLowerCase()).join(" ");
  return haystack.includes("美团") || haystack.includes("meituan");
}

function hasRealizedCancelledDeliveryCost(input: {
  deliveryFee: number;
  platform?: unknown;
  delivery?: unknown;
  hasOutbound?: boolean;
}) {
  return input.deliveryFee > 0
    && Boolean(input.hasOutbound)
    && !isRefundableMeituanDelivery(input.platform, input.delivery);
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
    // 隐式触发已到期的订单自动送达/自动完成状态变更
    void processDueAutoCompleteJobs(5).catch(() => {});

    const storage = await getStorageStrategy();
    const searchParams = request.nextUrl.searchParams;
    const liteMode = searchParams.get("_lite") === "1";
    const includeMetrics = !liteMode && searchParams.get("_metrics") === "1";
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const pageSize = Math.min(10000, Math.max(1, Number(searchParams.get("pageSize") || 20)));
    const query = String(searchParams.get("query") || "").trim();
    const platform = String(searchParams.get("platform") || "").trim();
    const status = String(searchParams.get("status") || "").trim();
    const productCostStatusFilter = status === "pending-outbound" || status === "pending-backfill"
      ? status
      : "";
    const startDate = String(searchParams.get("startDate") || "").trim();
    const endDate = String(searchParams.get("endDate") || "").trim();
    const hasDelivery = toBooleanFilter(searchParams.get("hasDelivery"));
    const mainSystemSelfDelivery = toBooleanFilter(searchParams.get("mainSystemSelfDelivery"));

    const requestedUserId = String(searchParams.get("userId") || "").trim();
    const canManageMembers = session.role === "SUPER_ADMIN"
      || hasAdminAccess(session, "members:manage")
      || hasAdminAccess(session, "members:status")
      || hasAdminAccess(session, "whitelist:manage")
      || hasAdminAccess(session, "roles:manage")
      || String(session.roleProfile?.name || "").includes("管理")
      || hasPermission(session, "order:manage");
    const targetUserId = (canManageMembers && requestedUserId) ? requestedUserId : session.id;

    const shopFilter = String(searchParams.get("shop") || "").trim();
    let shopWhereFilter: Prisma.AutoPickOrderWhereInput | undefined = undefined;
    if (shopFilter && shopFilter !== "all") {
      const targetShop = await prisma.shop.findFirst({
        where: {
          userId: targetUserId,
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
      userId: targetUserId,
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
          { customerRemark: { contains: query, mode: "insensitive" as const } },
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

    const platformWhere: Prisma.AutoPickOrderWhereInput | undefined = platform
      ? platform === "线下交易" || platform.toLowerCase() === "other"
        ? { platform: { in: ["线下交易", "other"] } }
        : { platform }
      : undefined;

    const where: Prisma.AutoPickOrderWhereInput = {
      ...baseWhere,
      ...(platformWhere || {}),
      ...(productCostStatusFilter ? {} : (buildStatusWhere(status) || {})),
    };

    const platformFilterWhere: Prisma.AutoPickOrderWhereInput = {
      ...baseWhere,
      ...(productCostStatusFilter ? {} : (buildStatusWhere(status) || {})),
    };

    const statusFilterWhere: Prisma.AutoPickOrderWhereInput = {
      ...baseWhere,
      ...(platformWhere || {}),
    };

    const cancelledWhere = buildStatusWhere("已取消");
    const deletedWhere = buildStatusWhere("已删除");

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
          customerRemark: true,
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
        skip: productCostStatusFilter ? 0 : (page - 1) * pageSize,
        take: productCostStatusFilter ? 10000 : pageSize,
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
        where: { id: targetUserId },
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
              OR: [
                ...(cancelledWhere ? [cancelledWhere] : []),
                ...(deletedWhere ? [deletedWhere] : []),
              ],
            },
          }),
      !includeMetrics
        ? Promise.resolve(0)
        : prisma.autoPickOrder.count({
            where: {
              ...where,
              ...(cancelledWhere || deletedWhere
                ? {
                    NOT: {
                      OR: [
                        ...(cancelledWhere ? [cancelledWhere] : []),
                        ...(deletedWhere ? [deletedWhere] : []),
                      ],
                    },
                  }
                : {}),
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
              orderNo: true,
              orderTime: true,
              actualPaid: true,
              expectedIncome: true,
              platformCommission: true,
              delivery: true,
              rawPayload: true,
              shopId: true,
              shopAddress: true,
              items: {
                select: {
                  productName: true,
                  productNo: true,
                  platformSkuId: true,
                  quantity: true,
                  rawPayload: true,
                },
              },
            },
          }),
    ]);
    perf.lap("core-queries");

    const allOrdersForCost = [...orders, ...(summaryOrders || [])];
    const orderTimes = allOrdersForCost.map((o) => o.orderTime).filter(Boolean);
    let minDate: Date | null = null;
    let maxDate: Date | null = null;
    if (orderTimes.length > 0) {
      const times = orderTimes.map((t) => new Date(t).getTime());
      minDate = new Date(Math.min(...times));
      maxDate = new Date(Math.max(...times));
    }

    const orderNos = new Set(allOrdersForCost.map((o) => String(o.orderNo || "").trim()).filter(Boolean));
    const outboundRows: OutboundLookupRow[] = [];

    if (orderNos.size > 0) {
      const outboundWhere: Prisma.OutboundOrderWhereInput = {
        userId: targetUserId,
        ...(minDate && maxDate ? {
          date: {
            gte: new Date(minDate.getTime() - 24 * 60 * 60 * 1000),
            lte: new Date(maxDate.getTime() + 24 * 60 * 60 * 1000),
          }
        } : {}),
      };

      const fetchAllOutboundOrders = async (includeCostSnapshot: boolean) => {
        return prisma.outboundOrder.findMany({
          where: outboundWhere,
          select: {
            id: true,
            note: true,
            status: true,
            items: {
              select: {
                id: true,
                productId: true,
                shopProductId: true,
                quantity: true,
                ...(includeCostSnapshot ? { costSnapshot: true } : {}),
                shopProduct: {
                  select: {
                    productName: true,
                    costPrice: true,
                    productImage: true,
                  },
                },
                product: {
                  select: {
                    name: true,
                    costPrice: true,
                    image: true,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });
      };

      let rawOutboundOrders = [];
      try {
        rawOutboundOrders = await fetchAllOutboundOrders(true);
      } catch (error) {
        if (!isPrismaMissingColumnError(error, "OutboundOrderItem.costSnapshot")) {
          throw error;
        }
        rawOutboundOrders = await fetchAllOutboundOrders(false);
      }

      const filtered = rawOutboundOrders.filter((outbound) => {
        const note = String(outbound.note || "");
        const match = note.match(/平台单号:\s*([^\s|]+)/);
        const orderNo = String(match?.[1] || "").trim();
        return orderNo && orderNos.has(orderNo);
      });

      outboundRows.push(...(filtered as OutboundLookupRow[]));
    }
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
      itemCount: number;
      productCost: number;
      refundAmount: number;
      extraExpense: number;
      returnedCost: number;
      returnDetails: Array<{
        id: string;
        createdAt: string;
        reason: string;
        refundAmount: number;
        extraExpense: number;
        returnedCost: number;
        items: Array<{
          outboundOrderItemId: string;
          quantity: number;
          name?: string | null;
        }>;
      }>;
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
              userId: targetUserId,
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
      const isCurrentReturned = outbound.status === "Returned";
      const existing = outboundByOrderNo.get(orderNo);
      const shouldSet = !existing || (!isCurrentReturned);
      if (orderNo && shouldSet) {
        const returnMeta = parseOutboundReturnMeta(outbound.note);
        const returnTotals = getOutboundReturnTotals(returnMeta.returns);
        const returnedQuantityMap = getOutboundReturnedQuantityMap(returnMeta.returns);
        const returnDetails = returnMeta.returns.map((entry) => ({
          id: entry.id,
          createdAt: entry.createdAt,
          reason: entry.reason,
          refundAmount: Math.round(Number(entry.refundAmount || 0) * 100),
          extraExpense: Math.round(Number(entry.extraExpense || 0) * 100),
          returnedCost: Math.round(Number(entry.returnedCost || 0) * 100),
          items: (entry.items || []).map((item) => ({
            outboundOrderItemId: item.outboundOrderItemId,
            quantity: item.quantity,
            name: item.name || null,
          })),
        }));
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
          const rawImage = item.shopProduct?.productImage || item.product?.image || null;
          const image = rawImage ? storage.resolveUrl(rawImage) : null;

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

          const hasCostSnapshot = item.costSnapshot !== null && item.costSnapshot !== undefined;
          const isMissing = hasCostSnapshot ? false : unitCost <= 0;
          if (isMissing) {
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
            quantity: Math.max(0, quantity - (returnedQuantityMap.get(item.id) || 0)),
            unitCost: roundCurrency(unitCost),
            totalCost: roundCurrency(totalCost),
            shopProductId,
            productId,
            batches,
            availableBatches,
            hasBackfilled: snapshot !== null,
            image,
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
          ? rawBreakdown.map((item) => {
              const scaledUnitCost = roundCurrency(item.unitCost * 100);
              return {
                ...item,
                unitCost: scaledUnitCost,
                totalCost: scaledUnitCost * item.quantity,
              };
            })
          : rawBreakdown.map((item) => ({
              ...item,
              totalCost: item.unitCost * item.quantity,
            }));
        const existingOutboundMeta = outboundByOrderNo.get(orderNo);
        if (existingOutboundMeta && existingOutboundMeta.itemCount > 0 && outbound.items.length === 0) {
          continue;
        }
        outboundByOrderNo.set(orderNo, {
          id: outbound.id,
          itemCount: outbound.items.length,
          productCost: Math.max(0, productCost - Math.round(returnTotals.returnedCost * 100)),
          refundAmount: Math.round(returnTotals.refundAmount * 100),
          extraExpense: Math.round(returnTotals.extraExpense * 100),
          returnedCost: Math.round(returnTotals.returnedCost * 100),
          returnDetails,
          missingCostItemCount,
          firstMissingCostShopProductId,
          firstMissingCostPurchaseOrderId,
          firstMissingCostPurchaseOrderItemId,
          breakdown,
        });
      }
    }

    const permissionsObj = userProfile?.permissions && typeof userProfile.permissions === "object" && !Array.isArray(userProfile.permissions)
      ? userProfile.permissions as Record<string, unknown>
      : {};
    const integrationConfig = normalizeAutoPickIntegrationConfig(permissionsObj.autoPickIntegration);

    const resolveProductCostStatusForOrder = (order: {
      platform: string | null;
      status: string | null;
      actualPaid: number;
      expectedIncome: number | null;
      delivery: unknown;
      orderNo: string;
      items: Array<{ productName?: string | null; productNo?: string | null; rawPayload?: unknown }>;
    }) => {
      const outboundMeta = outboundByOrderNo.get(order.orderNo) || null;
      const deliveryFee = readDeliveryFee(order.delivery);
      const hasOutbound = Boolean(outboundMeta);
      const cancelledDeliveryLoss = (isAutoPickOrderCancelledStatus(order.status) || isAutoPickOrderDeletedStatus(order.status))
        && hasRealizedCancelledDeliveryCost({
          deliveryFee,
          platform: order.platform,
          delivery: order.delivery,
          hasOutbound,
        });
      const manualDeliveryLoss = isOfflineManualDeliveryLossOrder({
        platform: order.platform,
        actualPaid: order.actualPaid,
        expectedIncome: order.expectedIncome,
        deliveryFee,
      }) && !hasAutoPickFulfillmentItems(order.items);
      const hasOrderFulfillment = hasAutoPickFulfillmentItems(order.items);
      const isOutboundEmpty = Boolean(outboundMeta && (outboundMeta.itemCount === 0 || (outboundMeta.breakdown?.length || 0) === 0));
      const effectiveHasOutbound = hasOutbound && (!hasOrderFulfillment || !isOutboundEmpty);
      if (cancelledDeliveryLoss || manualDeliveryLoss) {
        return "ready";
      }
      if (!effectiveHasOutbound) {
        return "pending-outbound";
      }
      return (outboundMeta?.missingCostItemCount || 0) > 0 ? "pending-backfill" : "ready";
    };

    const metricOrders = productCostStatusFilter
      ? orders.filter((order) => resolveProductCostStatusForOrder(order) === productCostStatusFilter)
      : summaryOrders;
    const responseTotal = productCostStatusFilter ? metricOrders.length : total;
    const responseOrders = (productCostStatusFilter
      ? metricOrders.slice((page - 1) * pageSize, page * pageSize)
      : orders) as typeof orders;

    const allOrderNos = Array.from(new Set([...metricOrders.map((o) => o.orderNo), ...responseOrders.map((o) => o.orderNo)])).filter(Boolean);
    const customBrushOrders = allOrderNos.length > 0
      ? await prisma.brushOrder.findMany({
          where: { userId: targetUserId, platformOrderId: { in: allOrderNos } },
          select: { platformOrderId: true, commission: true },
        })
      : [];
    const customBrushCommissionMap = new Map<string, number>(
      customBrushOrders
        .filter((b): b is { platformOrderId: string; commission: number } => Boolean(b.platformOrderId))
        .map((b) => [b.platformOrderId, b.commission])
    );

    const summary = !includeMetrics
      ? null
      : metricOrders.reduce((acc, order) => {
          const manualAmountOverride = readManualAmountOverride(order.rawPayload);
          const isOffline = order.platform === "线下交易" || String(order.platform || "").toLowerCase() === "other";
          let actualPaid = order.actualPaid;
          let expectedIncome = manualAmountOverride && Number.isFinite(Number(manualAmountOverride.expectedIncome))
            ? Number(manualAmountOverride.expectedIncome)
            : (typeof order.expectedIncome === "number"
              ? order.expectedIncome
              : readExpectedIncomeFromRawPayload(order.rawPayload));
          if (isOffline) {
            if ((!Number.isFinite(actualPaid) || actualPaid <= 0) && Number.isFinite(Number(expectedIncome)) && Number(expectedIncome) > 0) {
              actualPaid = Math.round(Number(expectedIncome));
            } else if ((!Number.isFinite(Number(expectedIncome)) || Number(expectedIncome) <= 0) && Number.isFinite(actualPaid) && actualPaid > 0) {
              expectedIncome = actualPaid;
            }
          }
          const metrics = resolveIncomeMetrics(
            order.platform,
            expectedIncome,
            actualPaid,
            manualAmountOverride && Number.isFinite(Number(manualAmountOverride.platformCommission))
              ? Number(manualAmountOverride.platformCommission)
              : manualAmountOverride?.onlyExpectedIncome
                ? 0
                : manualAmountOverride
              ? Math.round(Number(expectedIncome || 0) - Number(actualPaid || 0))
              : order.platformCommission,
            { preferExplicitExpectedIncome: Boolean(manualAmountOverride) }
          );
          const cancelled = isAutoPickOrderCancelledStatus(order.status);
          const deleted = isAutoPickOrderDeletedStatus(order.status);
          const platform = normalizeOrderPlatformForSummary(order.platform);
          const deliveryFee = readDeliveryFee(order.delivery);
          const outboundMeta = outboundByOrderNo.get(order.orderNo) || null;
          const lockedResolvedShop = readResolvedAutoPickShop(order.rawPayload);
          const mappingDebug = resolveMappedShopDebug(
            order.shopId,
            readShopNameFromRawPayload(order.rawPayload) || null,
            readShopAddressFromRawPayload(order.rawPayload) || order.shopAddress || null,
            userProfile?.permissions
          );
          const matchedShopId = lockedResolvedShop?.id || null;
          const matchedShopName = String(
            String(lockedResolvedShop?.name || "").trim() || mappingDebug.localShopName || ""
          ).trim();
          const shopProfitKey = matchedShopId || matchedShopName || order.shopId || order.shopAddress || "未匹配店铺";
          const shopProfitName = matchedShopName || order.shopAddress || "未匹配店铺";
          const ensureShopProfit = () => {
            if (!acc.shopProfit[shopProfitKey]) {
              acc.shopProfit[shopProfitKey] = {
                id: matchedShopId || null,
                name: shopProfitName,
                amount: 0,
                count: 0,
                deliveryFee: 0,
                productCost: 0,
                platformCommission: 0,
                platformProfit: {} as Record<string, number>,
              };
            }
            return acc.shopProfit[shopProfitKey];
          };
          if ((cancelled || deleted) && hasRealizedCancelledDeliveryCost({
            deliveryFee,
            platform: order.platform,
            delivery: order.delivery,
            hasOutbound: Boolean(outboundMeta),
          })) {
            acc.totalDeliveryFee += deliveryFee;
            acc.platformDelivery[platform] = (acc.platformDelivery[platform] || 0) + deliveryFee;
            acc.pureProfit -= deliveryFee;
            if (!acc.platformProfit[platform]) {
              acc.platformProfit[platform] = { amount: 0, count: 0 };
            }
            acc.platformProfit[platform].amount -= deliveryFee;
            const shopProfit = ensureShopProfit();
            shopProfit.amount -= deliveryFee;
            shopProfit.deliveryFee += deliveryFee;
            shopProfit.platformProfit[platform] = (shopProfit.platformProfit[platform] || 0) - deliveryFee;
          }
          if (!cancelled && !deleted) {
            const isBrush = readMainSystemSelfDeliveryFlag(order.rawPayload);
            const refundAmount = Math.max(outboundMeta?.refundAmount || 0, readRefundAmountFromRawPayload(order.rawPayload));
            const adjustedMetrics = resolveRefundAdjustedIncomeMetrics({
              expectedIncome: metrics.expectedIncome,
              platformCommission: metrics.platformCommission,
              actualPaid,
              refundAmount,
            });
            const expected = Math.max(0, Number(adjustedMetrics.expectedIncome || 0));
            acc.receivedAmount += expected;
            if (isBrush) {
              acc.brushReceivedAmount += expected;
              acc.brushPaidAmount += Number(actualPaid || 0);
            } else {
              acc.realReceivedAmount += expected;
              acc.realPaidAmount += Number(actualPaid || 0);
            }
            acc.platformCommission += adjustedMetrics.platformCommission;
            acc.validOrderCount += 1;

            if (!acc.platformReceived[platform]) {
              acc.platformReceived[platform] = { amount: 0, count: 0 };
            }
            acc.platformReceived[platform].amount += expected;
            acc.platformReceived[platform].count += 1;

            acc.totalDeliveryFee += deliveryFee;
            if (deliveryFee > 0) {
              acc.platformDelivery[platform] = (acc.platformDelivery[platform] || 0) + deliveryFee;
            }

            // 计算该 order 的 pureProfit
            const hiddenDeletedOfflineIncome = deleted && isOffline;
            const safeExpectedIncome = hiddenDeletedOfflineIncome
              ? null
              : (typeof adjustedMetrics.expectedIncome === "number" ? adjustedMetrics.expectedIncome : null);
            const serviceFeeRate = isOffline
              ? 0
              : (shopRateMap.get(matchedShopName) ?? 0.06);
            const productCost = outboundMeta?.productCost || 0;
            const returnExtraExpense = outboundMeta?.extraExpense || 0;
            const missingCostItemCount = outboundMeta?.missingCostItemCount || 0;
            const hasOutbound = Boolean(outboundMeta);
            const hasFulfillmentItems = hasAutoPickFulfillmentItems(order.items);
            const isManualDeliveryLoss = isOfflineManualDeliveryLossOrder({
              platform: order.platform,
              actualPaid,
              expectedIncome: adjustedMetrics.expectedIncome,
              deliveryFee,
            }) && !hasFulfillmentItems;
            const productCostStatus = isManualDeliveryLoss
              ? "ready" as const
              : !hasOutbound
              ? "pending-outbound" as const
              : missingCostItemCount > 0
                ? "pending-backfill" as const
                : "ready" as const;
            const customCommission = order.orderNo ? customBrushCommissionMap.get(order.orderNo) : undefined;
            const orderBrushCommissionYuan = typeof customCommission === "number" && customCommission >= 0
              ? customCommission
              : resolveShopBrushCommission(integrationConfig, {
                  maiyatianShopId: readShopIdFromRawPayload(order.rawPayload),
                  shopName: readShopNameFromRawPayload(order.rawPayload) || order.shopId,
                  shopAddress: readShopAddressFromRawPayload(order.rawPayload) || order.shopAddress,
                  localShopName: matchedShopName || null,
                  rawPayload: order.rawPayload,
                });
            const orderBrushCommission = Math.round(orderBrushCommissionYuan * 100);
            const orderPureProfit = hiddenDeletedOfflineIncome
              ? null
              : isManualDeliveryLoss
              ? -deliveryFee
              : isBrush
              ? -Number(adjustedMetrics.platformCommission || 0) - orderBrushCommission - returnExtraExpense
              : (productCostStatus === "ready"
                ? Math.round(Number(safeExpectedIncome || 0) * (1 - serviceFeeRate)) - deliveryFee - productCost - returnExtraExpense
                : null);

            const profitValue = typeof orderPureProfit === "number" && Number.isFinite(orderPureProfit) ? orderPureProfit : 0;
            acc.pureProfit += profitValue;
            if (!acc.platformProfit[platform]) {
              acc.platformProfit[platform] = { amount: 0, count: 0 };
            }
            acc.platformProfit[platform].amount += profitValue;
            acc.platformProfit[platform].count += 1;
            const shopProfit = ensureShopProfit();
            shopProfit.amount += profitValue;
            shopProfit.count += 1;
            shopProfit.deliveryFee += deliveryFee;
            shopProfit.productCost += productCost;
            shopProfit.platformCommission += adjustedMetrics.platformCommission;
            shopProfit.platformProfit[platform] = (shopProfit.platformProfit[platform] || 0) + profitValue;
          }
          acc.itemCount += order.items.reduce((sum: number, item) => sum + item.quantity, 0);
          return acc;
        }, {
          receivedAmount: 0,
          realReceivedAmount: 0,
          brushReceivedAmount: 0,
          realPaidAmount: 0,
          brushPaidAmount: 0,
          platformCommission: 0,
          validOrderCount: 0,
          itemCount: 0,
          totalDeliveryFee: 0,
          platformReceived: {} as Record<string, { amount: number; count: number }>,
          platformDelivery: {} as Record<string, number>,
          pureProfit: 0,
          platformProfit: {} as Record<string, { amount: number; count: number }>,
          shopProfit: {} as Record<string, { id: string | null; name: string; amount: number; count: number; deliveryFee: number; productCost: number; platformCommission: number; platformProfit: Record<string, number> }>,
        });

    const truePlatformCounts: Record<string, number> = {};
    const brushPlatformCounts: Record<string, number> = {};
    const cancelledPlatformCounts: Record<string, number> = {};

    if (includeMetrics) {
      for (const order of metricOrders) {
        const platform = normalizeOrderPlatformForSummary(order.platform);
        const cancelled = isAutoPickOrderCancelledStatus(order.status) || isAutoPickOrderDeletedStatus(order.status);
        if (cancelled) {
          cancelledPlatformCounts[platform] = (cancelledPlatformCounts[platform] || 0) + 1;
        } else {
          const isBrush = readMainSystemSelfDeliveryFlag(order.rawPayload);
          if (isBrush) {
            brushPlatformCounts[platform] = (brushPlatformCounts[platform] || 0) + 1;
          } else {
            truePlatformCounts[platform] = (truePlatformCounts[platform] || 0) + 1;
          }
        }
      }
    }

    const overview = !includeMetrics
      ? null
      : {
          totalCount: responseTotal,
          cancelledCount: productCostStatusFilter
            ? metricOrders.filter((order) => isAutoPickOrderCancelledStatus(order.status) || isAutoPickOrderDeletedStatus(order.status)).length
            : cancelledTotal,
          brushCount: productCostStatusFilter
            ? metricOrders.filter((order) => !isAutoPickOrderCancelledStatus(order.status) && !isAutoPickOrderDeletedStatus(order.status) && readMainSystemSelfDeliveryFlag(order.rawPayload)).length
            : brushTotal,
          trueOrderCount: Math.max(0, responseTotal - (productCostStatusFilter
            ? metricOrders.filter((order) => isAutoPickOrderCancelledStatus(order.status) || isAutoPickOrderDeletedStatus(order.status)).length
            : cancelledTotal) - (productCostStatusFilter
            ? metricOrders.filter((order) => !isAutoPickOrderCancelledStatus(order.status) && !isAutoPickOrderDeletedStatus(order.status) && readMainSystemSelfDeliveryFlag(order.rawPayload)).length
            : brushTotal)),
          platformBreakdown: {
            truePlatformCounts,
            brushPlatformCounts,
            cancelledPlatformCounts,
          },
        };
    await backfillJdSkuIdForManualMatchedShopProducts(prisma, targetUserId);
    await backfillMeituanSkuIdForManualMatchedShopProducts(prisma, targetUserId);
    await Promise.all(
      responseOrders
        .filter((order) => isMeituanPlatform(order.platform) || isJDPlatform(order.platform) || isTaobaoPlatform(order.platform))
        .map((order) => backfillPlatformIdsForSyncedAutoPickOrder(targetUserId, order.id).catch((error) => {
          console.warn("[orders/route] 忽略当前页平台 SKU 自动回填失败:", error);
        }))
    );

    const productNames = Array.from(new Set(
      responseOrders.flatMap((order) => order.items.map((item) => String(item.productName || "").trim()).filter(Boolean))
    ));
    const productSkuCandidates = Array.from(new Set(
      responseOrders.flatMap((order) => order.items.flatMap((item) => {
        const platformProductId = readPlatformProductIdForMatch(order.platform, item.rawPayload, item.productNo, item.platformSkuId);
        return platformProductId ? [platformProductId, ...buildSkuMatchCandidates(item.productNo)] : buildSkuMatchCandidates(item.productNo);
      }))
    ));

    const manualMatchedProductIds = Array.from(new Set(
      responseOrders.flatMap((order) => order.items.flatMap((item) => {
        const manual = readManualMatchedProduct(item.rawPayload);
        if (!manual) return [];
        const ids = [manual.id, manual.shopProductId, manual.productId].filter(Boolean) as string[];
        if (Array.isArray(manual.bundleItems)) {
          for (const b of manual.bundleItems) {
            if (b.id) ids.push(b.id);
            if (b.shopProductId) ids.push(b.shopProductId);
          }
        }
        return ids.flatMap((id) => id.split(/[+＋]/)).map((s) => s.trim()).filter(Boolean);
      }))
    ));

    const shopProducts = (productSkuCandidates.length > 0 || manualMatchedProductIds.length > 0)
      ? await prisma.shopProduct.findMany({
            where: {
              shop: { userId: targetUserId },
              OR: [
                ...(productSkuCandidates.length > 0 ? [
                  { sku: { in: productSkuCandidates } },
                  { jdSkuId: { in: productSkuCandidates } },
                  { meituanSkuId: { in: productSkuCandidates } },
                  { taobaoSkuId: { in: productSkuCandidates } },
                  { product: { jdSkuMappings: { some: { jdSkuId: { in: productSkuCandidates } } } } },
                ] : []),
                ...(manualMatchedProductIds.length > 0 ? [
                  { id: { in: manualMatchedProductIds } },
                  { productId: { in: manualMatchedProductIds } },
                ] : []),
              ],
            },
            select: {
              id: true,
              sku: true,
              jdSkuId: true,
              meituanSkuId: true,
              taobaoSkuId: true,
              productId: true,
              sourceProductId: true,
              productName: true,
              productImage: true,
              product: {
                select: {
                  image: true,
                },
              },
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

    const mappedShopProducts = shopProducts.map((item) => {
      const rawImage = item.productImage || item.product?.image || null;
      return {
        id: item.id,
        name: item.productName || "未命名商品",
        sku: item.sku,
        jdSkuId: item.jdSkuId,
        meituanSkuId: item.meituanSkuId,
        taobaoSkuId: item.taobaoSkuId,
        image: rawImage ? storage.resolveUrl(rawImage) : null,
        sourceType: "shopProduct" as const,
        productId: item.productId || item.sourceProductId || null,
        shopProductId: item.id,
        shopId: item.shop?.id || null,
        shopName: item.shop?.name || null,
      };
    });



    const autoMatchedMeituanBackfills: Array<{ shopProductId: string; meituanSkuId: string }> = [];
    const autoMatchedTaobaoBackfills: Array<{ shopProductId: string; taobaoSkuId: string }> = [];

    const enrichedOrders = responseOrders.map((order) => {
      const manualAmountOverride = readManualAmountOverride(order.rawPayload);
      const isOffline = order.platform === "线下交易" || String(order.platform || "").toLowerCase() === "other";
      let actualPaid = order.actualPaid;
      let expectedIncome = manualAmountOverride && Number.isFinite(Number(manualAmountOverride.expectedIncome))
        ? Number(manualAmountOverride.expectedIncome)
        : (typeof order.expectedIncome === "number"
          ? order.expectedIncome
          : readExpectedIncomeFromRawPayload(order.rawPayload));
      if (isOffline) {
        if ((!Number.isFinite(actualPaid) || actualPaid <= 0) && Number.isFinite(Number(expectedIncome)) && Number(expectedIncome) > 0) {
          actualPaid = Math.round(Number(expectedIncome));
        } else if ((!Number.isFinite(Number(expectedIncome)) || Number(expectedIncome) <= 0) && Number.isFinite(actualPaid) && actualPaid > 0) {
          expectedIncome = actualPaid;
        }
      }
      const metrics = resolveIncomeMetrics(
        order.platform,
        expectedIncome,
        actualPaid,
        manualAmountOverride && Number.isFinite(Number(manualAmountOverride.platformCommission))
          ? Number(manualAmountOverride.platformCommission)
          : manualAmountOverride?.onlyExpectedIncome
            ? 0
            : manualAmountOverride
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
        customerName: readCustomerNameFromRawPayload(order.rawPayload),
        customerPhone: readCustomerPhoneFromRawPayload(order.rawPayload),
        customerMaskedPhone: readCustomerMaskedPhoneFromRawPayload(order.rawPayload),
        customerPhoneExtension: readCustomerPhoneExtensionFromRawPayload(order.rawPayload),
        customerRemark: order.customerRemark || readCustomerRemarkFromRawPayload(order.rawPayload),
        delivery: order.delivery && typeof order.delivery === "object"
          ? {
              ...(order.delivery as Record<string, unknown>),
              riderPhone: readRiderPhoneFromDelivery(order.delivery) || readRiderPhoneFromRawPayload(order.rawPayload) || undefined,
            }
          : order.delivery,
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
      const hiddenDeletedOfflineIncome = order.isDeleted && order.platform === "线下交易";
      const refundAmount = Math.max(outboundMeta?.refundAmount || 0, readRefundAmountFromRawPayload(order.rawPayload));
      const returnExtraExpense = outboundMeta?.extraExpense || 0;
      const adjustedMetrics = resolveRefundAdjustedIncomeMetrics({
        expectedIncome: order.expectedIncome,
        platformCommission: order.platformCommission,
        actualPaid: order.actualPaid,
        refundAmount,
      });
      const safeExpectedIncome = hiddenDeletedOfflineIncome
        ? null
        : (typeof adjustedMetrics.expectedIncome === "number" ? adjustedMetrics.expectedIncome : null);
      const serviceFeeRate = order.platform === "线下交易"
        ? 0
        : (shopRateMap.get(matchedShopName) ?? 0.06);
      const productCost = outboundMeta?.productCost || 0;
      const deliveryFee = readDeliveryFee(order.delivery);
      const hasOutbound = Boolean(outboundMeta);
      const hasFulfillmentItems = hasAutoPickFulfillmentItems(order.items);
      const cancelledDeliveryLoss = (isAutoPickOrderCancelledStatus(order.status) || isAutoPickOrderDeletedStatus(order.status))
        && hasRealizedCancelledDeliveryCost({
          deliveryFee,
          platform: order.platform,
          delivery: order.delivery,
          hasOutbound,
        });
      const manualDeliveryLoss = isOfflineManualDeliveryLossOrder({
        platform: order.platform,
        actualPaid: order.actualPaid,
        expectedIncome: adjustedMetrics.expectedIncome,
        deliveryFee,
      }) && !hasFulfillmentItems;
      const isOutboundEmpty = Boolean(outboundMeta && (outboundMeta.itemCount === 0 || (outboundMeta.breakdown?.length || 0) === 0));
      const effectiveHasOutbound = hasOutbound && (!hasFulfillmentItems || !isOutboundEmpty);
      const missingCostItemCount = outboundMeta?.missingCostItemCount || 0;
      const productCostStatus = cancelledDeliveryLoss || manualDeliveryLoss
        ? "ready" as const
        : !effectiveHasOutbound
        ? "pending-outbound" as const
        : missingCostItemCount > 0
          ? "pending-backfill" as const
          : "ready" as const;
      const customCommission = order.orderNo ? customBrushCommissionMap.get(order.orderNo) : undefined;
      const orderBrushCommissionYuan = typeof customCommission === "number" && customCommission >= 0
        ? customCommission
        : resolveShopBrushCommission(integrationConfig, {
            maiyatianShopId: readShopIdFromRawPayload(order.rawPayload),
            shopName: readShopNameFromRawPayload(order.rawPayload) || order.shopId,
            shopAddress: readShopAddressFromRawPayload(order.rawPayload) || order.shopAddress,
            localShopName: matchedShopName || null,
            rawPayload: order.rawPayload,
          });
      const orderBrushCommission = Math.round(orderBrushCommissionYuan * 100);

      const pureProfit = hiddenDeletedOfflineIncome
        ? null
        : cancelledDeliveryLoss
        ? -deliveryFee
        : manualDeliveryLoss
        ? -deliveryFee
        : order.isMainSystemSelfDelivery
        ? -Number(order.platformCommission || 0) - orderBrushCommission - returnExtraExpense
        : (productCostStatus === "ready"
          ? Math.round(Number(safeExpectedIncome || 0) * (1 - serviceFeeRate)) - deliveryFee - productCost - returnExtraExpense
          : null);

      return {
        ...order,
        actualPaid: order.actualPaid,
        expectedIncome: safeExpectedIncome,
        refundAmount,
        returnExtraExpense,
        platformCommission: adjustedMetrics.platformCommission,
        brushCommission: orderBrushCommissionYuan,
        matchedShopId,
        matchedShopName,
        autoOutboundStatus: autoOutboundMeta.status,
        autoOutboundError: autoOutboundMeta.error,
        autoOutboundAttemptedAt: autoOutboundMeta.attemptedAt,
        autoOutboundResolvedAt: autoOutboundMeta.resolvedAt,
        hasOutbound: effectiveHasOutbound,
        outboundOrderId: effectiveHasOutbound ? (outboundMeta?.id || null) : null,
        serviceFeeRate,
        productCost: effectiveHasOutbound ? productCost : null,
        outboundReturnDetails: effectiveHasOutbound ? (outboundMeta?.returnDetails || []) : [],
        productCostBreakdown: effectiveHasOutbound ? (outboundMeta?.breakdown || []) : [],
        pureProfit,
        productCostStatus,
        missingCostItemCount,
        firstMissingCostShopProductId: outboundMeta?.firstMissingCostShopProductId || null,
        firstMissingCostPurchaseOrderId: outboundMeta?.firstMissingCostPurchaseOrderId || null,
        firstMissingCostPurchaseOrderItemId: outboundMeta?.firstMissingCostPurchaseOrderItemId || null,
        items: order.items.map((item) => {
          const manualMatchedProduct = readManualMatchedProduct(item.rawPayload);
          const isCompositeSku = /[+＋]/.test(String(item.productNo || ""));
          const strictPlatformProductId = isCompositeSku ? null : readStrictPlatformProductId(order.platform, item.rawPayload, item.platformSkuId);
          const platformProductId = isCompositeSku ? null : readPlatformProductIdForMatch(order.platform, item.rawPayload, item.productNo, item.platformSkuId);
          const skuFallbacks = splitCompositeSkuSegments(item.productNo);
          const normalizedSkuCandidates = skuFallbacks.length > 0
            ? skuFallbacks
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
              doesShopProductMatchStableKey(order.platform, product, normalizedSku)
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
          const platformStrictMatch = platformProductId ? resolveStrictSkuMatch(platformProductId) : null;
          const fallbackStrictMatches = normalizedSkuCandidates
            .map((candidate) => resolveStrictSkuMatch(candidate))
            .filter((product): product is typeof mappedShopProducts[number] => Boolean(product));
          const hasStrictMatchForAllSegments = normalizedSkuCandidates.length > 0
            && normalizedSkuCandidates.every((candidate) => Boolean(resolveStrictSkuMatch(candidate)));
          const matchedProduct = manualMatchedProduct || platformStrictMatch || (hasStrictMatchForAllSegments ? (fallbackStrictMatches[0] || null) : null);
          if (matchedProduct) {
            const foundShopProduct = mappedShopProducts.find((p) =>
              (matchedProduct.shopProductId && p.id === matchedProduct.shopProductId)
              || (matchedProduct.id && p.id === matchedProduct.id)
              || (matchedProduct.productId && p.productId === matchedProduct.productId)
              || (matchedProduct.sku && p.sku === matchedProduct.sku)
            );
            const fallbackImg = foundShopProduct?.image || null;
            matchedProduct.image = matchedProduct.image ? storage.resolveUrl(matchedProduct.image) : fallbackImg;
            if (!manualMatchedProduct && !isCompositeSku && isMeituanPlatform(order.platform) && strictPlatformProductId && foundShopProduct?.id) {
              autoMatchedMeituanBackfills.push({
                shopProductId: foundShopProduct.id,
                meituanSkuId: strictPlatformProductId,
              });
            }
            if (!manualMatchedProduct && isTaobaoPlatform(order.platform) && strictPlatformProductId && foundShopProduct?.id) {
              autoMatchedTaobaoBackfills.push({
                shopProductId: foundShopProduct.id,
                taobaoSkuId: strictPlatformProductId,
              });
            }
          }
          
          const matchedSkuToSplit = manualMatchedProduct?.sku || item.productNo;
          const segmentsFromSku = splitCompositeSkuSegments(matchedSkuToSplit);
          const hasStrictMatchForAllSegmentsFromSku = segmentsFromSku.length > 1
            && segmentsFromSku.every((candidate) => Boolean(resolveStrictSkuMatch(candidate)));

          const parentPlatformSkuId = String(item.platformSkuId || "").trim();
          const getProductSourceIdByPlatform = (product: any, platform?: string | null, excludedId?: string | null) => {
            if (!product) return undefined;
            let val: string | undefined = undefined;
            if (isMeituanPlatform(platform)) {
              const raw = String(product.meituanSkuId || "").trim();
              val = raw ? raw.split(",")[0].trim() : undefined;
            } else if (isJDPlatform(platform)) {
              const raw = String(product.jdSkuId || "").trim();
              val = raw ? raw.split(",")[0].trim() : undefined;
            } else if (isTaobaoPlatform(platform)) {
              const raw = String(product.taobaoSkuId || "").trim();
              val = raw ? raw.split(",")[0].trim() : undefined;
            }
            if (val && excludedId && String(val).trim().toLowerCase() === String(excludedId).trim().toLowerCase()) {
              return undefined;
            }
            return val;
          };

          const bundleItems = manualMatchedProduct?.bundleItems;
          const displayItems = (manualMatchedProduct && bundleItems && Array.isArray(bundleItems))
            ? bundleItems.map((bItem: any) => {
                const bQty = typeof bItem.quantity === "number" && bItem.quantity > 0
                  ? bItem.quantity
                  : (item.quantity > 1 && item.quantity % bundleItems.length === 0
                    ? Math.max(1, Math.floor(item.quantity / bundleItems.length))
                    : 1);
                const foundBShopProduct = mappedShopProducts.find((p) =>
                  (bItem.shopProductId && p.id === bItem.shopProductId)
                  || (bItem.id && p.id === bItem.id)
                  || (bItem.sku && p.sku === bItem.sku)
                );
                const bFallbackImg = foundBShopProduct?.image || null;
                const bResolvedImg = bItem.image ? storage.resolveUrl(bItem.image) : bFallbackImg;
                const bSourceId = getProductSourceIdByPlatform(foundBShopProduct, order.platform, parentPlatformSkuId)
                  || getProductSourceIdByPlatform(bItem, order.platform, parentPlatformSkuId);
                return {
                  name: bItem.name || item.productName || "未命名商品",
                  sku: (
                    isJDPlatform(order.platform)
                      ? (bItem.jdSkuId || bItem.sku)
                      : (bItem.sku || bItem.jdSkuId)
                  ) || "-",
                  image: bResolvedImg,
                  quantity: bQty,
                  sourceId: bSourceId || undefined,
                };
              })
            : hasStrictMatchForAllSegmentsFromSku
            ? segmentsFromSku.map((candidate) => {
                const segmentMatchedProduct = resolveStrictSkuMatch(candidate);
                const segQty = item.quantity > 1 && item.quantity % segmentsFromSku.length === 0
                  ? Math.max(1, Math.floor(item.quantity / segmentsFromSku.length))
                  : 1;
                const segSourceId = getProductSourceIdByPlatform(segmentMatchedProduct, order.platform, parentPlatformSkuId);
                return {
                  name: segmentMatchedProduct?.name || item.productName || "未命名商品",
                  sku: (
                    isJDPlatform(order.platform)
                      ? (segmentMatchedProduct?.jdSkuId || segmentMatchedProduct?.sku)
                      : (segmentMatchedProduct?.sku || segmentMatchedProduct?.jdSkuId)
                  ) || candidate,
                  image: segmentMatchedProduct?.image || (item.thumb ? storage.resolveUrl(item.thumb) : null),
                  quantity: segQty,
                  sourceId: segSourceId || undefined,
                };
              })
            : undefined;
          return {
            ...item,
            thumb: item.thumb ? storage.resolveUrl(item.thumb) : null,
            displayItems,
            matchedProduct,
          };
        }),
      };
    });
    const uniqueAutoMatchedMeituanBackfills = Array.from(
      new Map(autoMatchedMeituanBackfills.map((item) => [`${item.shopProductId}:${item.meituanSkuId}`, item])).values()
    );
    await Promise.all(uniqueAutoMatchedMeituanBackfills.map((item) =>
      syncMeituanSkuIdForShopProduct(prisma, targetUserId, item.shopProductId, item.meituanSkuId).catch((error) => {
        console.warn("[orders/route] 忽略展示层自动匹配美团 SKU 回填失败:", error);
      })
    ));
    const uniqueAutoMatchedTaobaoBackfills = Array.from(
      new Map(autoMatchedTaobaoBackfills.map((item) => [`${item.shopProductId}:${item.taobaoSkuId}`, item])).values()
    );
    await Promise.all(uniqueAutoMatchedTaobaoBackfills.map((item) =>
      syncTaobaoSkuIdForShopProduct(prisma, targetUserId, item.shopProductId, item.taobaoSkuId).catch((error) => {
        console.warn("[orders/route] 忽略展示层自动匹配淘宝 SKU 回填失败:", error);
      })
    ));
    perf.lap("response-build");
    perf.log("GET /api/orders", { page, pageSize, count: responseOrders.length, total: responseTotal });

    return NextResponse.json({
      items: enrichedOrders,
      meta: {
        total: responseTotal,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(responseTotal / pageSize)),
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
