import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { parseAsShanghaiTime } from "@/lib/dateUtils";
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
  const candidates = [
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

function stripShopSuffix(value: string) {
  return String(value || "").trim().replace(/(店|一店|二店|三店|分店|总店)$/, "");
}

function matchShopName(rawShopName: string | null, shippingAddresses: ShippingAddress[]) {
  const normalizedRawShopName = toNormalizedText(rawShopName);
  const looseRawShopName = toLooseNormalizedText(rawShopName);

  if (looseRawShopName) {
    const matchedByShopName = shippingAddresses.find((addr) => {
      const label = String(addr.label || "").trim();
      const coreLabel = stripShopSuffix(label);
      const looseLabel = toLooseNormalizedText(label);
      const looseCoreLabel = toLooseNormalizedText(coreLabel);
      return Boolean(
        (looseLabel && (looseRawShopName.includes(looseLabel) || looseLabel.includes(looseRawShopName))) ||
        (looseCoreLabel && (looseRawShopName.includes(looseCoreLabel) || looseCoreLabel.includes(looseRawShopName)))
      );
    });

    if (matchedByShopName?.label) {
      return String(matchedByShopName.label).trim();
    }
  }

  if (!normalizedRawShopName) {
    return null;
  }

  const matchedByNormalizedShopName = shippingAddresses.find((addr) => {
    const label = String(addr.label || "").trim();
    const normalizedLabel = toNormalizedText(label);
    const normalizedCoreLabel = toNormalizedText(stripShopSuffix(label));
    return Boolean(
      (normalizedLabel && (normalizedRawShopName.includes(normalizedLabel) || normalizedLabel.includes(normalizedRawShopName))) ||
      (normalizedCoreLabel && (normalizedRawShopName.includes(normalizedCoreLabel) || normalizedCoreLabel.includes(normalizedRawShopName)))
    );
  });

  return matchedByNormalizedShopName?.label ? String(matchedByNormalizedShopName.label).trim() : null;
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
        select: { shippingAddresses: true },
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
        rawShopName: readShopNameFromRawPayload(order.rawPayload),
        deliveryTimeRange: order.deliveryTimeRange || readDeliveryTimeRangeFromRawPayload(order.rawPayload),
        isPickup: pickup,
        expectedIncome: metrics.expectedIncome,
        platformCommission: metrics.platformCommission,
        autoCompleteJobStatus: order.autoCompleteJob?.status || null,
        autoCompleteJobError: order.autoCompleteJob?.lastError || null,
        autoCompleteJobAttempts: order.autoCompleteJob?.attempts ?? null,
      };
    }).map((order) => {
      const matchedShopName = matchShopName(order.rawShopName, shippingAddresses);

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
