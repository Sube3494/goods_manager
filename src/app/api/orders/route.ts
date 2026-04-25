import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { parseAsShanghaiTime } from "@/lib/dateUtils";
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
  label?: string;
  address?: string;
  externalId?: string;
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

function resolvePlatformCommission(expectedIncome: number | null, actualPaid: number, fallbackCommission: number) {
  if (Number.isFinite(Number(expectedIncome))) {
    return Math.round(Number(expectedIncome) - Number(actualPaid || 0));
  }
  return Math.round(Number(fallbackCommission || 0));
}

function readShopAddressFromRawPayload(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }
  const record = rawPayload as Record<string, unknown>;
  const value = String(record.shopAddress || record.storeAddress || record.merchantAddress || "").trim();
  return value || null;
}

function readShopIdFromRawPayload(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }
  const record = rawPayload as Record<string, unknown>;
  const value = String(record.shopId || record.shop_id || record.storeId || record.store_id || record.merchant_id || "").trim();
  return value || null;
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

function stripShopSuffix(value: string) {
  return String(value || "").trim().replace(/(店|一店|二店|三店|分店|总店)$/, "");
}

function matchShopName(shopId: string | null, shopAddress: string | null, rawShopName: string | null, shippingAddresses: ShippingAddress[]) {
  const normalizedShopId = String(shopId || "").trim();
  const normalizedShopAddress = String(shopAddress || "").trim();
  const normalizedRawShopName = toNormalizedText(rawShopName);

  if (normalizedShopId) {
    const matchedById = shippingAddresses.find((addr) => String(addr.externalId || "").trim() === normalizedShopId);
    if (matchedById?.label) {
      return String(matchedById.label).trim();
    }
  }

  if (normalizedShopAddress) {
    const directMatch = shippingAddresses.find((addr) => {
      const address = String(addr.address || "").trim();
      if (!address) return false;
      return address.includes(normalizedShopAddress) || normalizedShopAddress.includes(address);
    });
    if (directMatch?.label) {
      return String(directMatch.label).trim();
    }

    const fallback = shippingAddresses.find((addr) => {
      const label = String(addr.label || "").trim();
      const coreLocation = stripShopSuffix(label);
      return coreLocation.length >= 2 && normalizedShopAddress.includes(coreLocation);
    });
    if (fallback?.label) {
      return String(fallback.label).trim();
    }
  }

  if (!normalizedRawShopName) {
    return null;
  }

  const matchedByShopName = shippingAddresses.find((addr) => {
    const label = String(addr.label || "").trim();
    const normalizedLabel = toNormalizedText(label);
    const normalizedCoreLabel = toNormalizedText(stripShopSuffix(label));
    return Boolean(
      (normalizedLabel && (normalizedRawShopName.includes(normalizedLabel) || normalizedLabel.includes(normalizedRawShopName))) ||
      (normalizedCoreLabel && (normalizedRawShopName.includes(normalizedCoreLabel) || normalizedCoreLabel.includes(normalizedRawShopName)))
    );
  });

  return matchedByShopName?.label ? String(matchedByShopName.label).trim() : null;
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
        include: {
          items: {
            orderBy: { createdAt: "asc" },
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
      const platformCommission = resolvePlatformCommission(expectedIncome, order.actualPaid, order.platformCommission);
      acc.actualPaid += order.actualPaid;
      acc.platformCommission += platformCommission;
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

    const productNos = Array.from(new Set(
      orders.flatMap((order) => order.items.map((item) => String(item.productNo || "").trim()).filter(Boolean))
    ));

    const [shopProducts, products] = productNos.length > 0
      ? await Promise.all([
          prisma.shopProduct.findMany({
            where: {
              shop: { userId: session.id },
              sku: { in: productNos },
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
          prisma.product.findMany({
            where: {
              userId: session.id,
              sku: { in: productNos },
            },
            select: {
              id: true,
              sku: true,
              name: true,
              image: true,
            },
          }),
        ])
      : [[], []];

    const shippingAddresses = Array.isArray(userProfile?.shippingAddresses)
      ? (userProfile.shippingAddresses as ShippingAddress[])
      : [];

    const shopProductMap = new Map<string, MatchedCatalogProduct>();
    const shopScopedProductMap = new Map<string, MatchedCatalogProduct>();
    for (const item of shopProducts) {
      const sku = String(item.sku || "").trim();
      if (!sku || shopProductMap.has(sku)) continue;
      shopProductMap.set(sku, {
        id: item.id,
        name: item.productName || sku,
        sku: item.sku,
        image: item.productImage,
        sourceType: "shopProduct",
        shopName: item.shop?.name || null,
      });
      const scopedShopName = String(item.shop?.name || "").trim();
      if (scopedShopName) {
        shopScopedProductMap.set(`${scopedShopName}::${sku}`, {
          id: item.id,
          name: item.productName || sku,
          sku: item.sku,
          image: item.productImage,
          sourceType: "shopProduct",
          shopName: item.shop?.name || null,
        });
      }
    }

    const productMap = new Map<string, MatchedCatalogProduct>();
    for (const item of products) {
      const sku = String(item.sku || "").trim();
      if (!sku || productMap.has(sku)) continue;
      productMap.set(sku, {
        id: item.id,
        name: item.name,
        sku: item.sku,
        image: item.image,
        sourceType: "product",
      });
    }

    const enrichedOrders = orders.map((order) => ({
      ...order,
      shopId: readShopIdFromRawPayload(order.rawPayload),
      shopAddress: readShopAddressFromRawPayload(order.rawPayload),
      rawShopName: readShopNameFromRawPayload(order.rawPayload),
      expectedIncome: readExpectedIncomeFromRawPayload(order.rawPayload),
    })).map((order) => {
      const matchedShopName = matchShopName(order.shopId, order.shopAddress, order.rawShopName, shippingAddresses);
      return {
        ...order,
        platformCommission: resolvePlatformCommission(order.expectedIncome, order.actualPaid, order.platformCommission),
        matchedShopName,
        items: order.items.map((item) => {
        const sku = String(item.productNo || "").trim();
        const matchedProduct = sku
          ? ((matchedShopName ? shopScopedProductMap.get(`${matchedShopName}::${sku}`) : null) || shopProductMap.get(sku) || productMap.get(sku) || null)
          : null;
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
