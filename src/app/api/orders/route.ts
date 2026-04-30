import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { normalizeAutoPickIntegrationConfig } from "@/lib/autoPickOrders";
import { parseAsShanghaiTime } from "@/lib/dateUtils";
import { isAutoPickOrderCancelledStatus, isAutoPickOrderDeletedStatus, isAutoPickOtherPickupOrder, isAutoPickPickupOrder, resolveAutoPickBusinessStatus } from "@/lib/autoPickOrderStatus";
import { Prisma } from "../../../../prisma/generated-client";
import { buildShopDedupeKey, normalizeExternalId, normalizeShopNameKey } from "@/lib/shopIdentity";

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
    case "拣货中":
      return {
        OR: [
          { status: { contains: "拣货中", mode: "insensitive" } },
        ],
      };
    case "已拣货":
      return {
        OR: [
          { status: { contains: "已拣货", mode: "insensitive" } },
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
  image?: string | null;
  sourceType: "product" | "shopProduct";
  shopName?: string | null;
};

type UserPermissionsPayload = {
  autoPickIntegration?: unknown;
};

type AutoPickSystemMeta = {
  resolvedShop?: {
    id?: string;
    name?: string;
  };
};

function toNormalizedText(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .replace(/[（(].*?[)）]/g, " ")
    .replace(/\s+/g, "")
    .toLowerCase();
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

function isJDPlatform(platform: string | null | undefined) {
  return String(platform || "").includes("京东");
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
  fallbackCommission: number
) {
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
    record.store_address,
    record.merchant_address,
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

export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") || 20)));
    const query = String(searchParams.get("query") || "").trim();
    const platform = String(searchParams.get("platform") || "").trim();
    const status = String(searchParams.get("status") || "").trim();
    const startDate = String(searchParams.get("startDate") || "").trim();
    const endDate = String(searchParams.get("endDate") || "").trim();
    const hasDelivery = toBooleanFilter(searchParams.get("hasDelivery"));
    const mainSystemSelfDelivery = toBooleanFilter(searchParams.get("mainSystemSelfDelivery"));

    const baseWhere: Prisma.AutoPickOrderWhereInput = {
      userId: session.id,
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

    const [orders, total, platformRows, statusRows, userProfile] = await Promise.all([
      prisma.autoPickOrder.findMany({
        where,
        select: {
          id: true,
          userId: true,
          sourceId: true,
          shopId: true,
          logisticId: true,
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
      prisma.autoPickOrder.findMany({
        where: platformFilterWhere,
        distinct: ["platform"],
        select: { platform: true },
        orderBy: { platform: "asc" },
      }),
      prisma.autoPickOrder.findMany({
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
        select: { permissions: true },
      }),
    ]);

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
          },
          orderBy: {
            createdAt: "desc",
          },
        })
      : [];

    const outboundByOrderNo = new Map<string, { id: string }>();
    for (const outbound of outboundRows) {
      const note = String(outbound.note || "");
      const match = note.match(/平台单号:\s*([^\s|]+)/);
      const orderNo = String(match?.[1] || "").trim();
      if (orderNo && !outboundByOrderNo.has(orderNo)) {
        outboundByOrderNo.set(orderNo, { id: outbound.id });
      }
    }

    const summary = orders.reduce((acc, order) => {
      const expectedIncome = readExpectedIncomeFromRawPayload(order.rawPayload);
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

    const productNames = Array.from(new Set(
      orders.flatMap((order) => order.items.map((item) => String(item.productName || "").trim()).filter(Boolean))
    ));

    const shopProducts = productNames.length > 0
      ? await prisma.shopProduct.findMany({
            where: {
              shop: { userId: session.id },
              productName: { in: productNames },
            },
            select: {
              id: true,
              sku: true,
              productName: true,
              productImage: true,
              shop: {
                select: {
                  name: true,
                },
              },
            },
          })
      : [];

    const shopProductMap = new Map<string, MatchedCatalogProduct[]>();
    for (const item of shopProducts) {
      const normalizedName = toNormalizedText(item.productName);
      if (!normalizedName) continue;

      const current = shopProductMap.get(normalizedName) || [];
      current.push({
        id: item.id,
        name: item.productName || "未命名商品",
        sku: item.sku,
        image: item.productImage,
        sourceType: "shopProduct",
        shopName: item.shop?.name || null,
      });
      shopProductMap.set(normalizedName, current);
    }

    const enrichedOrders = orders.map((order) => {
      const expectedIncome = typeof order.expectedIncome === "number"
        ? order.expectedIncome
        : readExpectedIncomeFromRawPayload(order.rawPayload);
      const metrics = resolveIncomeMetrics(order.platform, expectedIncome, order.actualPaid, order.platformCommission);
      const deleted = isAutoPickOrderDeletedStatus(order.status);
      const pickup = isAutoPickPickupOrder(order.rawPayload, order.userAddress);
      const otherPickup = isAutoPickOtherPickupOrder(order.rawPayload);
      const businessStatus = resolveAutoPickBusinessStatus(order.status, order.rawPayload, order.userAddress);
      return {
        ...order,
        shopId: order.shopId || readShopIdFromRawPayload(order.rawPayload),
        shopAddress: order.shopAddress,
        rawShopName: readShopNameFromRawPayload(order.rawPayload) || null,
        rawShopAddress: readShopAddressFromRawPayload(order.rawPayload) || null,
        deliveryTimeRange: order.deliveryTimeRange || readDeliveryTimeRangeFromRawPayload(order.rawPayload),
        isMainSystemSelfDelivery: readMainSystemSelfDeliveryFlag(order.rawPayload),
        isPickup: pickup,
        isOtherPickup: otherPickup,
        isDeleted: deleted,
        isSubscribe: readIsSubscribeFromRawPayload(order.rawPayload),
        status: businessStatus || order.status,
        expectedIncome: metrics.expectedIncome,
        platformCommission: metrics.platformCommission,
        completedAt: order.autoCompleteJob?.completedAt?.toISOString() || readCompletedAtFromRawPayload(order.rawPayload),
        autoCompleteJobStatus: order.autoCompleteJob?.status || null,
        autoCompleteJobError: order.autoCompleteJob?.lastError || null,
        autoCompleteJobAttempts: order.autoCompleteJob?.attempts ?? null,
        hasOutbound: outboundByOrderNo.has(order.orderNo),
        outboundOrderId: outboundByOrderNo.get(order.orderNo)?.id || null,
      };
    }).map((order) => {
      const lockedResolvedShop = readResolvedAutoPickShop(order.rawPayload);
      const mappingDebug = resolveMappedShopDebug(
        order.shopId,
        order.rawShopName,
        order.rawShopAddress,
        userProfile?.permissions
      );
      const matchedShopName = String(lockedResolvedShop?.name || "").trim() || mappingDebug.localShopName;
      const autoOutboundMeta = readAutoOutboundMeta(order.rawPayload);

      return {
        ...order,
        matchedShopName,
        autoOutboundStatus: autoOutboundMeta.status,
        autoOutboundError: autoOutboundMeta.error,
        autoOutboundAttemptedAt: autoOutboundMeta.attemptedAt,
        autoOutboundResolvedAt: autoOutboundMeta.resolvedAt,
        items: order.items.map((item) => {
          const normalizedProductName = toNormalizedText(item.productName);
          const matchedShopProducts = normalizedProductName
            ? (shopProductMap.get(normalizedProductName) || [])
            : [];
          const exactShopProduct = matchedShopProducts.find(
            (product) => String(product.shopName || "").trim() === String(matchedShopName || "").trim()
          );
          const matchedProduct = !normalizedProductName
            ? null
            : (exactShopProduct || null);
          return {
            ...item,
            matchedProduct,
          };
        }),
      };
    });

    return NextResponse.json({
      items: enrichedOrders,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      filters: {
        platforms: platformRows.map((item) => item.platform).filter(Boolean),
        statuses: statusRows.map((item) => item.status).filter((item): item is string => Boolean(item)),
      },
      summary,
    });
  } catch (error) {
    console.error("Failed to fetch auto-pick orders:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to fetch orders",
    }, { status: 500 });
  }
}
