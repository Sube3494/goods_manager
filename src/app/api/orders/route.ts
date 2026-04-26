import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { parseAsShanghaiTime } from "@/lib/dateUtils";
import { getAddressDetail } from "@/lib/addressBook";
import { isAutoPickPickupOrder } from "@/lib/autoPickOrderStatus";
import { Prisma } from "../../../../prisma/generated-client";

export const dynamic = "force-dynamic";

function toBooleanFilter(value: string | null) {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

type MatchedCatalogProduct = {
  id: string;
  name: string;
  sku?: string | null;
  image?: string | null;
  sourceType: "product" | "shopProduct";
  shopName?: string | null;
};

type ShippingAddress = {
  id?: string;
  label?: string;
  address?: string;
  detailAddress?: string;
  longitude?: number | null;
  latitude?: number | null;
};

type AutoPickShopMappingEntry = {
  type: "name" | "address";
  normalizedValue: string;
  matchedShopName: string;
  updatedAt?: string;
};

type UserPermissionsPayload = {
  autoPickShopMappings?: unknown;
};

function toNormalizedText(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .replace(/[（(].*?[)）]/g, " ")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function toLooseNormalizedText(value: string | null | undefined) {
  return String(value || "")
    .trim()
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

function isJDPlatform(platform: string | null | undefined) {
  return String(platform || "").includes("京东");
}

function shouldPreferAddressMatch(platform: string | null | undefined) {
  const text = String(platform || "").trim();
  return text.includes("京东") || text.includes("淘宝");
}

function normalizeShopMappingEntry(input: unknown): AutoPickShopMappingEntry | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const record = input as Record<string, unknown>;
  const type = record.type === "address" ? "address" : record.type === "name" ? "name" : null;
  const normalizedValue = String(record.normalizedValue || "").trim();
  const matchedShopName = String(record.matchedShopName || "").trim();
  const updatedAt = String(record.updatedAt || "").trim();

  if (!type || !normalizedValue || !matchedShopName) {
    return null;
  }

  return {
    type,
    normalizedValue,
    matchedShopName,
    updatedAt: updatedAt || undefined,
  };
}

function getAutoPickShopMappingsFromPermissions(input: unknown) {
  const permissions = input && typeof input === "object" && !Array.isArray(input)
    ? input as UserPermissionsPayload
    : {};

  const rawMappings = Array.isArray(permissions.autoPickShopMappings)
    ? permissions.autoPickShopMappings
    : [];

  return rawMappings
    .map((item) => normalizeShopMappingEntry(item))
    .filter((item): item is AutoPickShopMappingEntry => Boolean(item));
}

function findMappedShopNameFromCache(
  platform: string | null | undefined,
  rawShopName: string | null,
  rawShopAddress: string | null,
  mappings: AutoPickShopMappingEntry[],
  shippingAddresses: ShippingAddress[]
) {
  const validShopNames = new Set(
    shippingAddresses
      .map((item) => String(item.label || "").trim())
      .filter(Boolean)
  );

  const normalizedName = toNormalizedText(rawShopName);
  const normalizedAddress = normalizeShopAddressForMatch(rawShopAddress);
  const preferAddressMatch = shouldPreferAddressMatch(platform);

  const findByType = (type: "name" | "address", normalizedValue: string) => {
    if (!normalizedValue) {
      return null;
    }

    const matched = mappings.find((item) => item.type === type && item.normalizedValue === normalizedValue);
    if (!matched) {
      return null;
    }

    return validShopNames.has(matched.matchedShopName) ? matched.matchedShopName : null;
  };

  return preferAddressMatch
    ? (findByType("address", normalizedAddress) || findByType("name", normalizedName))
    : (findByType("name", normalizedName) || findByType("address", normalizedAddress));
}

function buildShopMappingEntries(rawShopName: string | null, rawShopAddress: string | null, matchedShopName: string | null) {
  const normalizedName = toNormalizedText(rawShopName);
  const normalizedAddress = normalizeShopAddressForMatch(rawShopAddress);
  const shopName = String(matchedShopName || "").trim();

  if (!shopName) {
    return [];
  }

  const entries: AutoPickShopMappingEntry[] = [];
  if (normalizedName) {
    entries.push({
      type: "name",
      normalizedValue: normalizedName,
      matchedShopName: shopName,
      updatedAt: new Date().toISOString(),
    });
  }
  if (normalizedAddress) {
    entries.push({
      type: "address",
      normalizedValue: normalizedAddress,
      matchedShopName: shopName,
      updatedAt: new Date().toISOString(),
    });
  }

  return entries;
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
    record.shop_name,
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
    ?? 0
  );

  if (Number.isFinite(directTimestamp) && directTimestamp > 0) {
    return new Date(directTimestamp * 1000).toISOString();
  }

  const directText = String(record.finished_time || record.finishedTime || "").trim();
  if (directText && /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(directText)) {
    return directText.replace(" ", "T");
  }

  return null;
}

function stripShopSuffix(value: string) {
  return String(value || "").trim().replace(/(店|一店|二店|三店|分店|总店)$/, "");
}

function normalizeShopAddressForMatch(value: string | null | undefined) {
  return String(value || "")
    .replace(/[（(][^()（）]*[)）]/g, " ")
    .replace(/(?:必须送货上门|不然没人签收|送货上门|一定送上门|一定要送上门|请送上门)/gi, " ")
    .replace(/贵州省|广东省|广州市|遵义市|白云区|汇川区|棠景街|香港路|祥岗东街/gi, " ")
    .replace(/商务中心/gi, "商务中心")
    .replace(/[栋座]/g, "座")
    .replace(/[室房]/g, "室")
    .replace(/号楼/g, "楼")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function extractShopAddressAnchors(value: string | null | undefined) {
  const normalized = normalizeShopAddressForMatch(value);
  if (!normalized) {
    return [];
  }

  const anchors = new Set<string>();

  const patterns = [
    /[a-z]\d{1,4}室/gi,
    /\d{1,3}楼/gi,
    /[a-z]座/gi,
    /[a-z]栋/gi,
    /[\u4e00-\u9fa5a-z0-9]{2,20}(?:商务中心|广场|大厦|中心|花园|御景|天际|花城|帝标)/gi,
  ];

  for (const pattern of patterns) {
    const matches = normalized.match(pattern) || [];
    for (const item of matches) {
      anchors.add(String(item).toLowerCase());
    }
  }

  return Array.from(anchors);
}

function isShopAddressAnchorMatch(left: string | null | undefined, right: string | null | undefined) {
  const leftNormalized = normalizeShopAddressForMatch(left);
  const rightNormalized = normalizeShopAddressForMatch(right);
  if (!leftNormalized || !rightNormalized) {
    return false;
  }

  if (leftNormalized.includes(rightNormalized) || rightNormalized.includes(leftNormalized)) {
    return true;
  }

  const leftAnchors = extractShopAddressAnchors(leftNormalized);
  const rightAnchors = extractShopAddressAnchors(rightNormalized);
  if (leftAnchors.length === 0 || rightAnchors.length === 0) {
    return false;
  }

  const overlap = leftAnchors.filter((item) => rightAnchors.includes(item));
  if (overlap.length >= 2) {
    return true;
  }

  const hasStrongLandmark = overlap.some((item) => /(?:商务中心|广场|大厦|中心|花园|御景|天际|花城|帝标)/i.test(item));
  const hasUnitAnchor = overlap.some((item) => /(?:座|栋|\d+楼|[a-z]\d{1,4}室)/i.test(item));
  return hasStrongLandmark && hasUnitAnchor;
}

function matchShopName(
  platform: string | null | undefined,
  rawShopName: string | null,
  rawShopAddress: string | null,
  shippingAddresses: ShippingAddress[]
) {
  const normalizedRawShopName = toNormalizedText(rawShopName);
  const looseRawShopName = toLooseNormalizedText(rawShopName);
  const normalizedShopAddress = normalizeShopAddressForMatch(rawShopAddress);
  const preferAddressMatch = shouldPreferAddressMatch(platform);

  const matchByShopName = () => {
    if (looseRawShopName) {
      const matchedByShopName = shippingAddresses.find((addr) => {
        const label = String(addr.label || "").trim();
        const coreLabel = stripShopSuffix(label);
        const looseLabel = toLooseNormalizedText(label);
        const looseCoreLabel = toLooseNormalizedText(coreLabel);
        return Boolean(
          (looseLabel && (looseRawShopName.includes(looseLabel) || looseLabel.includes(looseRawShopName))) ||
          (looseCoreLabel && (looseRawShopName.includes(looseCoreLabel) || looseLabel.includes(looseRawShopName)))
        );
      });

      if (matchedByShopName?.label) {
        return String(matchedByShopName.label).trim();
      }
    }

    if (normalizedRawShopName) {
      const matchedByNormalizedShopName = shippingAddresses.find((addr) => {
        const label = String(addr.label || "").trim();
        const normalizedLabel = toNormalizedText(label);
        const normalizedCoreLabel = toNormalizedText(stripShopSuffix(label));
        return Boolean(
          (normalizedLabel && (normalizedRawShopName.includes(normalizedLabel) || normalizedLabel.includes(normalizedRawShopName))) ||
          (normalizedCoreLabel && (normalizedRawShopName.includes(normalizedCoreLabel) || normalizedCoreLabel.includes(normalizedRawShopName)))
        );
      });

      if (matchedByNormalizedShopName?.label) {
        return String(matchedByNormalizedShopName.label).trim();
      }
    }

    return null;
  };

  const matchByAddress = () => {
    if (!normalizedShopAddress) {
      return null;
    }

    const matchedByAddress = shippingAddresses.find((addr) => {
      return isShopAddressAnchorMatch(getAddressDetail(addr), rawShopAddress);
    });

    return matchedByAddress?.label ? String(matchedByAddress.label).trim() : null;
  };

  return preferAddressMatch
    ? (matchByAddress() || matchByShopName())
    : (matchByShopName() || matchByAddress());
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

    const where: Prisma.AutoPickOrderWhereInput = {
      userId: session.id,
      ...(platform ? { platform } : {}),
      ...(status ? { status } : {}),
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
        where: { userId: session.id },
        distinct: ["platform"],
        select: { platform: true },
        orderBy: { platform: "asc" },
      }),
      prisma.autoPickOrder.findMany({
        where: { userId: session.id, NOT: { status: null } },
        distinct: ["status"],
        select: { status: true },
        orderBy: { status: "asc" },
      }),
      prisma.user.findUnique({
        where: { id: session.id },
        select: { shippingAddresses: true, permissions: true },
      }),
    ]);

    const summary = orders.reduce((acc, order) => {
      const expectedIncome = readExpectedIncomeFromRawPayload(order.rawPayload);
      const metrics = resolveIncomeMetrics(order.platform, expectedIncome, order.actualPaid, order.platformCommission);
      acc.actualPaid += order.actualPaid;
      acc.platformCommission += metrics.platformCommission;
      acc.itemCount += order.items.reduce((sum: number, item) => sum + item.quantity, 0);
      if (order.delivery) {
        acc.deliveryCount += 1;
      }
      return acc;
    }, {
      actualPaid: 0,
      platformCommission: 0,
      itemCount: 0,
      deliveryCount: 0,
    });

    const productNames = Array.from(new Set(
      orders.flatMap((order) => order.items.map((item) => String(item.productName || "").trim()).filter(Boolean))
    ));

    const [products, shopProducts] = productNames.length > 0
      ? await Promise.all([
          prisma.product.findMany({
            where: {
              userId: session.id,
              name: { in: productNames },
            },
            select: {
              id: true,
              sku: true,
              name: true,
              image: true,
            },
          }),
          prisma.shopProduct.findMany({
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
          }),
        ])
      : [[], []];

    const shippingAddresses = Array.isArray(userProfile?.shippingAddresses)
      ? (userProfile.shippingAddresses as ShippingAddress[])
      : [];
    const cachedShopMappings = getAutoPickShopMappingsFromPermissions(userProfile?.permissions);

    const productMap = new Map<string, MatchedCatalogProduct>();
    for (const item of products) {
      const normalizedName = toNormalizedText(item.name);
      if (!normalizedName || productMap.has(normalizedName)) continue;
      productMap.set(normalizedName, {
        id: item.id,
        name: item.name,
        sku: item.sku,
        image: item.image,
        sourceType: "product",
      });
    }

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

    const discoveredMappings = new Map<string, AutoPickShopMappingEntry>();

    const enrichedOrders = orders.map((order) => {
      const expectedIncome = typeof order.expectedIncome === "number"
        ? order.expectedIncome
        : readExpectedIncomeFromRawPayload(order.rawPayload);
      const metrics = resolveIncomeMetrics(order.platform, expectedIncome, order.actualPaid, order.platformCommission);
      const pickup = isAutoPickPickupOrder(order.rawPayload, order.userAddress);
      return {
        ...order,
        shopId: order.shopId,
        shopAddress: order.shopAddress,
        rawShopName: readShopNameFromRawPayload(order.rawPayload) || null,
        rawShopAddress: readShopAddressFromRawPayload(order.rawPayload) || null,
        deliveryTimeRange: order.deliveryTimeRange || readDeliveryTimeRangeFromRawPayload(order.rawPayload),
        isPickup: pickup,
        isSubscribe: readIsSubscribeFromRawPayload(order.rawPayload),
        expectedIncome: metrics.expectedIncome,
        platformCommission: metrics.platformCommission,
        completedAt: order.autoCompleteJob?.completedAt?.toISOString() || readCompletedAtFromRawPayload(order.rawPayload),
        autoCompleteJobStatus: order.autoCompleteJob?.status || null,
        autoCompleteJobError: order.autoCompleteJob?.lastError || null,
        autoCompleteJobAttempts: order.autoCompleteJob?.attempts ?? null,
      };
    }).map((order) => {
      const cachedShopName = findMappedShopNameFromCache(
        order.platform,
        order.rawShopName,
        order.rawShopAddress,
        cachedShopMappings,
        shippingAddresses
      );
      const matchedShopName = cachedShopName || matchShopName(order.platform, order.rawShopName, order.rawShopAddress, shippingAddresses);

      if (!cachedShopName && matchedShopName) {
        for (const entry of buildShopMappingEntries(order.rawShopName, order.rawShopAddress, matchedShopName)) {
          discoveredMappings.set(`${entry.type}:${entry.normalizedValue}`, entry);
        }
      }

      return {
        ...order,
        matchedShopName,
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
            : (
                exactShopProduct ||
                productMap.get(normalizedProductName) ||
                null
              );
          return {
            ...item,
            matchedProduct,
          };
        }),
      };
    });

    if (discoveredMappings.size > 0) {
      const existingMappings = cachedShopMappings.slice();
      const existingKeys = new Set(existingMappings.map((item) => `${item.type}:${item.normalizedValue}`));
      for (const entry of discoveredMappings.values()) {
        if (!existingKeys.has(`${entry.type}:${entry.normalizedValue}`)) {
          existingMappings.push(entry);
        }
      }

      const currentPermissions = userProfile?.permissions && typeof userProfile.permissions === "object" && !Array.isArray(userProfile.permissions)
        ? { ...(userProfile.permissions as Record<string, unknown>) }
        : {};
      const nextPermissions: Record<string, unknown> = {
        ...currentPermissions,
        autoPickShopMappings: existingMappings,
      };

      await prisma.user.update({
        where: { id: session.id },
        data: {
          permissions: nextPermissions as Prisma.InputJsonValue,
        },
      });
    }

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
