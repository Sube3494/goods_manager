import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { FinanceMath } from "@/lib/math";
import { normalizeAutoPickIntegrationConfig } from "@/lib/autoPickOrders";
import { isAutoPickOrderCancelledStatus, isAutoPickOrderDeletedStatus } from "@/lib/autoPickOrderStatus";
import { createRequestPerfTracker } from "@/lib/perf";
import { buildShopDedupeKey, normalizeExternalId, normalizeShopNameKey } from "@/lib/shopIdentity";

function startOfDay(input: Date) {
  const date = new Date(input);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(input: Date) {
  const date = new Date(input);
  date.setHours(23, 59, 59, 999);
  return date;
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(date: Date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildDateSeries(start: Date, end: Date) {
  const list: Array<{ date: string; label: string }> = [];
  const cursor = startOfDay(start);
  const last = startOfDay(end);
  while (cursor <= last) {
    list.push({ date: formatDateKey(cursor), label: formatDateLabel(cursor) });
    cursor.setDate(cursor.getDate() + 1);
  }
  return list;
}

function extractShopNameFromNote(note: string | null | undefined) {
  const match = String(note || "").match(/\[店铺:([^\]]+)\]/);
  return String(match?.[1] || "").trim();
}

function readAutoPickSystemMeta(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }
  const candidate = (rawPayload as Record<string, unknown>).systemMeta;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  return candidate as Record<string, unknown>;
}

function readResolvedAutoPickShop(rawPayload: unknown) {
  const systemMeta = readAutoPickSystemMeta(rawPayload);
  const resolvedShop = systemMeta?.resolvedShop;
  if (!resolvedShop || typeof resolvedShop !== "object" || Array.isArray(resolvedShop)) {
    return null;
  }
  const id = String((resolvedShop as Record<string, unknown>).id || "").trim();
  const name = String((resolvedShop as Record<string, unknown>).name || "").trim();
  if (!id && !name) {
    return null;
  }
  return { id: id || null, name: name || null };
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
    if (value) return value;
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
    if (value) return value;
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
  const candidates = [record.shop_id, delivery?.shop_id];
  for (const item of candidates) {
    const value = String(item || "").trim();
    if (value) return value;
  }
  return null;
}

function readMainSystemSelfDeliveryFlag(rawPayload: unknown) {
  const systemMeta = readAutoPickSystemMeta(rawPayload);
  const marker = systemMeta?.mainSystemSelfDelivery;
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) {
    return false;
  }
  return Boolean((marker as Record<string, unknown>).triggered);
}

function findMappedShopNameFromIntegrationConfig(
  maiyatianShopId: string | null,
  rawShopName: string | null,
  rawShopAddress: string | null,
  permissions: unknown
) {
  const config = normalizeAutoPickIntegrationConfig(permissions);
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
  const targetKey = buildShopDedupeKey({ name: rawShopName, address: rawShopAddress });
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
  return matchedByIdentity?.localShopName || null;
}

function resolveAutoPickMatchedShopName(order: { shopId?: string | null; rawPayload?: unknown }, permissions: unknown) {
  const resolved = readResolvedAutoPickShop(order.rawPayload);
  const resolvedName = String(resolved?.name || "").trim();
  if (resolvedName) {
    return resolvedName;
  }
  const rawShopName = readShopNameFromRawPayload(order.rawPayload);
  const rawShopAddress = readShopAddressFromRawPayload(order.rawPayload);
  const mappedName = findMappedShopNameFromIntegrationConfig(
    order.shopId || readShopIdFromRawPayload(order.rawPayload),
    rawShopName,
    rawShopAddress,
    permissions
  );
  return String(mappedName || rawShopName || "").trim() || null;
}

const DASHBOARD_PLATFORMS = ["美团", "京东", "淘宝", "其他"] as const;

export async function GET(request: NextRequest) {
  const perf = createRequestPerfTracker(request);
  try {
    const user = await getAuthorizedUser("dashboard:read");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rangeMode = request.nextUrl.searchParams.get("range");
    const shopName = (request.nextUrl.searchParams.get("shopName") || "").trim();
    const settings = await prisma.systemSetting.findFirst({
      where: { userId: user.id },
    });
    const threshold = settings?.lowStockThreshold ?? 10;

    const endDate = request.nextUrl.searchParams.get("endDate")
      ? endOfDay(new Date(request.nextUrl.searchParams.get("endDate")!))
      : endOfDay(new Date());

    let startDate = request.nextUrl.searchParams.get("startDate")
      ? startOfDay(new Date(request.nextUrl.searchParams.get("startDate")!))
      : startOfDay(new Date(endDate.getTime() - 29 * 24 * 60 * 60 * 1000));

    if (rangeMode === "all") {
      const [firstPurchase, firstOutbound, firstBrush, firstSettlement, firstShopProduct, firstAutoPickOrder] = await Promise.all([
        prisma.purchaseOrder.findFirst({
          where: {
            userId: user.id,
            ...(shopName ? { shopName } : {}),
          },
          orderBy: { date: "asc" },
          select: { date: true },
        }),
        prisma.outboundOrder.findFirst({
          where: {
            userId: user.id,
            ...(shopName ? { note: { contains: `[店铺:${shopName}]` } } : {}),
          },
          orderBy: { date: "asc" },
          select: { date: true },
        }),
        prisma.brushOrder.findFirst({
          where: {
            userId: user.id,
            ...(shopName ? { shopName } : {}),
          },
          orderBy: { date: "asc" },
          select: { date: true },
        }),
        prisma.settlement.findFirst({
          where: {
            userId: user.id,
            ...(shopName
              ? {
                  OR: [
                    { shopName },
                    { items: { some: { shopName } } },
                  ],
                }
              : {}),
          },
          orderBy: { date: "asc" },
          select: { date: true },
        }),
        prisma.shopProduct.findFirst({
          where: {
            shop: {
              userId: user.id,
              ...(shopName ? { name: shopName } : {}),
            },
          },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        }),
        prisma.autoPickOrder.findFirst({
          where: {
            userId: user.id,
          },
          orderBy: { orderTime: "asc" },
          select: {
            orderTime: true,
            shopId: true,
            rawPayload: true,
          },
        }),
      ]);

      const candidates = [
        firstPurchase?.date,
        firstOutbound?.date,
        firstBrush?.date,
        firstSettlement?.date,
        firstShopProduct?.createdAt,
        !shopName || resolveAutoPickMatchedShopName(firstAutoPickOrder || {}, user.permissions) === shopName
          ? firstAutoPickOrder?.orderTime
          : null,
      ].filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()));

      if (candidates.length > 0) {
        startDate = startOfDay(new Date(Math.min(...candidates.map((item) => item.getTime()))));
      }
    }
    perf.lap("range-bootstrap");

    const [shopCount, shopProductRows, recentInboundItems, purchaseOrdersInRange, outboundOrdersInRange, pendingOrders, autoPickOrdersInRange] = await Promise.all([
      prisma.shop.count({
        where: {
          userId: user.id,
          isSource: true,
          ...(shopName ? { name: shopName } : {}),
        },
      }),
      prisma.shopProduct.findMany({
        where: {
          shop: {
            userId: user.id,
            ...(shopName ? { name: shopName } : {}),
          },
        },
        select: {
          id: true,
          shopId: true,
          stock: true,
          costPrice: true,
          sku: true,
          productName: true,
          sourceProductId: true,
          shop: { select: { id: true, name: true } },
        },
      }),
      prisma.purchaseOrderItem.findMany({
        take: 10,
        where: {
          purchaseOrder: {
            userId: user.id,
            status: "Received",
            ...(shopName ? { shopName } : {}),
          },
        },
        include: {
          product: { select: { id: true, name: true, sku: true, image: true } },
          supplier: { select: { id: true, name: true } },
          purchaseOrder: { select: { id: true, date: true, status: true } },
        },
        orderBy: { purchaseOrder: { date: "desc" } },
      }),
      prisma.purchaseOrder.findMany({
        where: {
          userId: user.id,
          ...(shopName ? { shopName } : {}),
          date: { gte: startDate, lte: endDate },
        },
        select: {
          id: true,
          date: true,
          shopName: true,
          totalAmount: true,
          status: true,
        },
        orderBy: { date: "asc" },
      }),
      prisma.outboundOrder.findMany({
        where: {
          userId: user.id,
          ...(shopName ? { note: { contains: `[店铺:${shopName}]` } } : {}),
          date: { gte: startDate, lte: endDate },
        },
        select: {
          id: true,
          date: true,
          note: true,
          items: {
            select: {
              quantity: true,
              price: true,
            },
          },
        },
        orderBy: { date: "asc" },
      }),
      prisma.purchaseOrder.findMany({
        where: {
          userId: user.id,
          status: "Ordered",
          ...(shopName ? { shopName } : {}),
        },
        select: {
          id: true,
          totalAmount: true,
        },
      }),
      prisma.autoPickOrder.findMany({
        where: {
          userId: user.id,
          orderTime: { gte: startDate, lte: endDate },
        },
        select: {
          id: true,
          platform: true,
          status: true,
          orderTime: true,
          shopId: true,
          rawPayload: true,
          actualPaid: true,
          delivery: true,
          expectedIncome: true,
          platformCommission: true,
          items: {
            select: {
              quantity: true,
              productNo: true,
              productName: true,
            },
          },
        },
        orderBy: { orderTime: "asc" },
      }),
    ]);
    perf.lap("core-queries");

    const [brushOrdersInRange, promotionExpensesInRange] = await Promise.all([
      prisma.brushOrder.findMany({
        where: {
          userId: user.id,
          ...(shopName ? { shopName } : {}),
          date: { gte: startDate, lte: endDate },
        },
        select: {
          id: true,
          date: true,
          shopName: true,
          type: true,
          paymentAmount: true,
          receivedAmount: true,
          commission: true,
        },
        orderBy: { date: "asc" },
      }),
      prisma.dailyPromotionExpense.findMany({
        where: {
          userId: user.id,
          date: { gte: startDate, lte: endDate },
        },
        select: {
          date: true,
          amount: true,
        },
      }),
    ]);
    perf.lap("secondary-queries");

    const filteredAutoPickOrdersInRange = shopName
      ? autoPickOrdersInRange.filter((order) => resolveAutoPickMatchedShopName(order, user.permissions) === shopName)
      : autoPickOrdersInRange;

    const pendingOrderCount = pendingOrders.length;
    const pendingInboundAmount = pendingOrders.reduce(
      (sum, order) => FinanceMath.add(sum, order.totalAmount || 0),
      0
    );

    const productCount = shopProductRows.length;
    const totalStock = shopProductRows.reduce((sum, item) => sum + (item.stock || 0), 0);
    const lowStockCount = shopProductRows.filter((item) => (item.stock || 0) < threshold).length;
    const totalValue = shopProductRows.reduce(
      (sum, item) => FinanceMath.add(sum, FinanceMath.multiply(item.costPrice || 0, item.stock || 0)),
      0
    );
    const activeShopNames = new Set<string>();
    purchaseOrdersInRange.forEach((order) => {
      const name = String(order.shopName || "").trim();
      if (name) activeShopNames.add(name);
    });
    outboundOrdersInRange.forEach((order) => {
      const name = extractShopNameFromNote(order.note);
      if (name) activeShopNames.add(name);
    });
    brushOrdersInRange.forEach((order) => {
      const name = String(order.shopName || "").trim();
      if (name) activeShopNames.add(name);
    });
    if (activeShopNames.size === 0 && shopName) {
      activeShopNames.add(shopName);
    }
    const activeShopCount = activeShopNames.size;
    const zeroCostProductCount = shopProductRows.filter((item) => Number(item.costPrice || 0) <= 0).length;
    const zeroStockProductCount = shopProductRows.filter((item) => Number(item.stock || 0) <= 0).length;

    const duplicateSourceMap = new Map<string, Set<string>>();
    shopProductRows.forEach((item) => {
      if (!item.sourceProductId) return;
      if (!duplicateSourceMap.has(item.sourceProductId)) {
        duplicateSourceMap.set(item.sourceProductId, new Set());
      }
      duplicateSourceMap.get(item.sourceProductId)!.add(item.shopId);
    });
    const duplicateSourceProductCount = Array.from(duplicateSourceMap.values()).filter((shops) => shops.size > 1).length;

    // 先获取收货地址库中的店铺抽出率
    const userDb = await prisma.user.findUnique({
      where: { id: user.id },
      select: { shippingAddresses: true }
    });
    const userAddresses = userDb && Array.isArray(userDb.shippingAddresses) 
      ? (userDb.shippingAddresses as Array<Record<string, unknown>>) 
      : [];
    const shopRateMap = new Map<string, number>();
    userAddresses.forEach((addr) => {
      const label = String(addr.label || "").trim();
      if (label && typeof addr.serviceFeeRate === "number") {
        shopRateMap.set(label, addr.serviceFeeRate);
      }
    });
    const productCostMap = new Map<string, number>();
    shopProductRows.forEach((row) => {
      const sku = String(row.sku || "").trim();
      if (sku) {
        productCostMap.set(sku, row.costPrice || 0);
      }
      const productName = String(row.productName || "").trim();
      if (productName) {
        productCostMap.set(productName, row.costPrice || 0);
      }
    });

    function getDeliveryFee(delivery: unknown) {
      if (!delivery || typeof delivery !== "object" || Array.isArray(delivery)) {
        return 0;
      }
      const value = Number((delivery as Record<string, unknown>).sendFee || 0);
      return Number.isFinite(value) ? Math.max(0, value) : 0;
    }

    const purchaseAmount = purchaseOrdersInRange.reduce((sum, order) => FinanceMath.add(sum, order.totalAmount || 0), 0);
    const brushExpense = brushOrdersInRange.reduce(
      (sum, order) => FinanceMath.add(sum, FinanceMath.add((order.paymentAmount || 0) - (order.receivedAmount || 0), order.commission || 0)),
      0
    );

    let userPaid = 0;
    let platformCommission = 0;
    let deliveryExpense = 0;
    let productCost = 0;

    filteredAutoPickOrdersInRange.forEach((order) => {
      const isCancelled = isAutoPickOrderCancelledStatus(order.status) || isAutoPickOrderDeletedStatus(order.status);
      if (!isCancelled) {
        const paidYuan = (order.actualPaid || 0) / 100;
        const matchedShopName = resolveAutoPickMatchedShopName(order, user.permissions) || "";
        const isOffline = order.platform === "线下交易";
        const rate = isOffline ? 0 : (shopRateMap.get(matchedShopName) ?? 0.06);
        const commissionYuan = isOffline ? 0 : (paidYuan * rate);
        const deliveryYuan = getDeliveryFee(order.delivery) / 100;

        let orderCostYuan = 0;
        if (Array.isArray(order.items)) {
          order.items.forEach((item) => {
            const sku = String(item.productNo || "").trim();
            const name = String(item.productName || "").trim();
            const unitCost = productCostMap.get(sku) ?? productCostMap.get(name) ?? 0;
            orderCostYuan += unitCost * (item.quantity || 0);
          });
        }

        userPaid = FinanceMath.add(userPaid, paidYuan);
        platformCommission = FinanceMath.add(platformCommission, commissionYuan);
        deliveryExpense = FinanceMath.add(deliveryExpense, deliveryYuan);
        productCost = FinanceMath.add(productCost, orderCostYuan);
      } else {
        const platformStr = String(order.platform || "").trim().toLowerCase();
        const deliveryObj = order.delivery && typeof order.delivery === "object" && !Array.isArray(order.delivery)
          ? order.delivery as Record<string, unknown>
          : {};
        const logisticNameStr = String(deliveryObj.logisticName || deliveryObj.logistic_name || "").trim().toLowerCase();
        const isMeituanRelated = platformStr.includes("美团") || platformStr.includes("meituan") ||
                                 logisticNameStr.includes("美团") || logisticNameStr.includes("meituan");
        if (!isMeituanRelated) {
          const deliveryYuan = getDeliveryFee(order.delivery) / 100;
          deliveryExpense = FinanceMath.add(deliveryExpense, deliveryYuan);
        }
      }
    });

    const outboundAmount = userPaid;
    const promotionExpense = promotionExpensesInRange.reduce(
      (sum, item) => FinanceMath.add(sum, item.amount || 0),
      0
    );
    const otherExpense = 0;

    const netProfit = FinanceMath.add(
      userPaid,
      -platformCommission - deliveryExpense - productCost - promotionExpense - brushExpense - otherExpense
    );

    const dateSeries = buildDateSeries(startDate, endDate);
    const createTrendBucket = () => ({
      trueOrderCount: 0,
      brushOrderCount: 0,
      otherOrderCount: 0,
      userPaid: 0,
      brushPaid: 0,
      platformCommission: 0,
      deliveryExpense: 0,
      productCost: 0,
      brushExpense: 0,
      promotionExpense: 0,
    });

    const businessTrendMap = new Map<string, {
      trueOrderCount: number;
      brushOrderCount: number;
      otherOrderCount: number;
      userPaid: number;
      brushPaid: number;
      platformCommission: number;
      deliveryExpense: number;
      productCost: number;
      brushExpense: number;
      promotionExpense: number;
    }>();
    dateSeries.forEach((item) => {
      businessTrendMap.set(item.date, createTrendBucket());
    });

    const normalizePlatform = (value: string | null | undefined) => {
      const raw = String(value || "").trim();
      if (!raw) return "其他";
      if (raw.includes("美团")) return "美团";
      if (raw.includes("京东")) return "京东";
      if (raw.includes("淘宝") || raw.includes("天猫")) return "淘宝";
      return "其他";
    };

    const platformBuckets = new Map<string, { trueOrderCount: number; brushOrderCount: number }>();
    const platformTrendMaps = new Map<string, Map<string, ReturnType<typeof createTrendBucket>>>();
    DASHBOARD_PLATFORMS.forEach((platform) => {
      platformBuckets.set(platform, { trueOrderCount: 0, brushOrderCount: 0 });
      const trendMap = new Map<string, ReturnType<typeof createTrendBucket>>();
      dateSeries.forEach((item) => {
        trendMap.set(item.date, createTrendBucket());
      });
      platformTrendMaps.set(platform, trendMap);
    });

    filteredAutoPickOrdersInRange.forEach((order) => {
      const key = formatDateKey(new Date(order.orderTime));
      const point = businessTrendMap.get(key);
      const platform = normalizePlatform(order.platform);
      const platformPoint = platformTrendMaps.get(platform)?.get(key);
      const current = platformBuckets.get(platform) || { trueOrderCount: 0, brushOrderCount: 0 };
      const isBrush = readMainSystemSelfDeliveryFlag(order.rawPayload);
      const isOther = isAutoPickOrderCancelledStatus(order.status) || isAutoPickOrderDeletedStatus(order.status);

      if (point) {
        if (isBrush) {
          point.brushOrderCount += 1;
        } else if (isOther) {
          point.otherOrderCount += 1;
        } else {
          point.trueOrderCount += 1;
        }
      }
      if (platformPoint) {
        if (isBrush) {
          platformPoint.brushOrderCount += 1;
        } else if (isOther) {
          platformPoint.otherOrderCount += 1;
        } else {
          platformPoint.trueOrderCount += 1;
        }
      }
      if (isBrush) {
        current.brushOrderCount += 1;
      } else if (!isOther) {
        current.trueOrderCount += 1;
      }
      platformBuckets.set(platform, current);

      if (!isOther) {
        const paidYuan = (order.actualPaid || 0) / 100;
        const matchedShopName = resolveAutoPickMatchedShopName(order, user.permissions) || "";
        const isOffline = order.platform === "线下交易";
        const rate = isOffline ? 0 : (shopRateMap.get(matchedShopName) ?? 0.06);
        const commissionYuan = isOffline ? 0 : (paidYuan * rate);
        const deliveryYuan = getDeliveryFee(order.delivery) / 100;

        if (point) {
          point.userPaid = FinanceMath.add(point.userPaid, paidYuan);
          point.platformCommission = FinanceMath.add(point.platformCommission, commissionYuan);
          point.deliveryExpense = FinanceMath.add(point.deliveryExpense, deliveryYuan);
        }
        if (platformPoint) {
          platformPoint.userPaid = FinanceMath.add(platformPoint.userPaid, paidYuan);
          platformPoint.platformCommission = FinanceMath.add(platformPoint.platformCommission, commissionYuan);
          platformPoint.deliveryExpense = FinanceMath.add(platformPoint.deliveryExpense, deliveryYuan);
        }

        if (isBrush) {
          if (point) {
            point.brushPaid = FinanceMath.add(point.brushPaid, paidYuan);
          }
          if (platformPoint) {
            platformPoint.brushPaid = FinanceMath.add(platformPoint.brushPaid, paidYuan);
          }
        } else {
          let orderCostYuan = 0;
          if (Array.isArray(order.items)) {
            order.items.forEach((item) => {
              const sku = String(item.productNo || "").trim();
              const name = String(item.productName || "").trim();
              const unitCost = productCostMap.get(sku) ?? productCostMap.get(name) ?? 0;
              orderCostYuan += unitCost * (item.quantity || 0);
            });
          }

          if (point) {
            point.productCost = FinanceMath.add(point.productCost, orderCostYuan);
          }
          if (platformPoint) {
            platformPoint.productCost = FinanceMath.add(platformPoint.productCost, orderCostYuan);
          }
        }
      } else {
        const platformStr = String(order.platform || "").trim().toLowerCase();
        const deliveryObj = order.delivery && typeof order.delivery === "object" && !Array.isArray(order.delivery)
          ? order.delivery as Record<string, unknown>
          : {};
        const logisticNameStr = String(deliveryObj.logisticName || deliveryObj.logistic_name || "").trim().toLowerCase();
        const isMeituanRelated = platformStr.includes("美团") || platformStr.includes("meituan") ||
                                 logisticNameStr.includes("美团") || logisticNameStr.includes("meituan");
        if (!isMeituanRelated) {
          const deliveryYuan = getDeliveryFee(order.delivery) / 100;
          if (point) {
            point.deliveryExpense = FinanceMath.add(point.deliveryExpense, deliveryYuan);
          }
          if (platformPoint) {
            platformPoint.deliveryExpense = FinanceMath.add(platformPoint.deliveryExpense, deliveryYuan);
          }
        }
      }
    });

    brushOrdersInRange.forEach((order) => {
      const key = formatDateKey(new Date(order.date));
      const point = businessTrendMap.get(key);
      const expense = FinanceMath.add((order.paymentAmount || 0) - (order.receivedAmount || 0), order.commission || 0);
      const platform = normalizePlatform(order.type);
      const platformPoint = platformTrendMaps.get(platform)?.get(key);
      if (point) {
        point.brushExpense = FinanceMath.add(point.brushExpense, expense);
      }
      if (platformPoint) {
        platformPoint.brushExpense = FinanceMath.add(platformPoint.brushExpense, expense);
      }
    });

    promotionExpensesInRange.forEach((item) => {
      const key = formatDateKey(new Date(item.date));
      const point = businessTrendMap.get(key);
      if (point) {
        point.promotionExpense = FinanceMath.add(point.promotionExpense, item.amount || 0);
      }
    });

    const buildTrendSeries = (source: Map<string, ReturnType<typeof createTrendBucket>>) => {
      let cumulativeOrders = 0;
      return dateSeries.map((item) => {
        const point = source.get(item.date);
        const orderCount = (point?.trueOrderCount || 0) + (point?.brushOrderCount || 0) + (point?.otherOrderCount || 0);
        cumulativeOrders += orderCount;
        
        const profit = FinanceMath.add(
          point?.userPaid || 0,
          -(point?.brushPaid || 0)
          - (point?.platformCommission || 0)
          - (point?.brushExpense || 0)
          - (point?.deliveryExpense || 0)
          - (point?.productCost || 0)
          - (point?.promotionExpense || 0)
        );

        return {
          date: item.date,
          label: item.label,
          trueOrderCount: point?.trueOrderCount || 0,
          brushOrderCount: point?.brushOrderCount || 0,
          orderCount,
          cumulativeOrderCount: cumulativeOrders,
          productCost: point?.productCost || 0,
          brushExpense: point?.brushExpense || 0,
          netProfit: profit,
        };
      });
    };

    const businessTrend = buildTrendSeries(businessTrendMap);
    const platformBusinessTrend = Object.fromEntries(
      DASHBOARD_PLATFORMS.map((platform) => [platform, buildTrendSeries(platformTrendMaps.get(platform)!)])
    );

    const platformMatrixColumns = DASHBOARD_PLATFORMS.map((platform) => {
      const current = platformBuckets.get(platform) || { trueOrderCount: 0, brushOrderCount: 0 };
      return {
        platform,
        trueOrderCount: current.trueOrderCount,
        brushOrderCount: current.brushOrderCount,
        totalCount: current.trueOrderCount + current.brushOrderCount,
      };
    });

    const shopBreakdownMap = new Map<string, { shopId: string; shopName: string; skuCount: number; stock: number; lowStockCount: number; value: number }>();
    shopProductRows.forEach((item) => {
      const current = shopBreakdownMap.get(item.shopId) || {
        shopId: item.shopId,
        shopName: item.shop?.name || "未命名店铺",
        skuCount: 0,
        stock: 0,
        lowStockCount: 0,
        value: 0,
      };
      current.skuCount += 1;
      current.stock += item.stock || 0;
      if ((item.stock || 0) < threshold) current.lowStockCount += 1;
      current.value = FinanceMath.add(current.value, FinanceMath.multiply(item.costPrice || 0, item.stock || 0));
      shopBreakdownMap.set(item.shopId, current);
    });

    const shopBreakdown = Array.from(shopBreakdownMap.values()).sort((a, b) => b.skuCount - a.skuCount || b.stock - a.stock);

    const alerts = [
      { key: "low-stock", label: "低库存商品", value: lowStockCount, tone: "danger" as const, hint: "优先补货，避免断货", href: "/shop-goods" },
      { key: "pending-inbound", label: "待入库订单", value: pendingOrderCount, tone: "warning" as const, hint: "还有采购单等待验收入库", href: "/purchases?status=Ordered" },
      { key: "zero-cost", label: "未填进货价", value: zeroCostProductCount, tone: "warning" as const, hint: "经营数据还不完整", href: "/shop-goods" },
      { key: "duplicate-template", label: "多店重复铺货", value: duplicateSourceProductCount, tone: "info" as const, hint: "同模板已铺到多个店铺", href: "/shop-goods" },
    ];

    const transformedInboundItems = recentInboundItems.map((item) => ({
      id: item.id,
      productId: item.productId,
      product: item.product,
      supplier: item.supplier,
      quantity: item.quantity,
      costPrice: item.costPrice,
      purchaseOrder: item.purchaseOrder,
      subtotal: FinanceMath.multiply(item.costPrice, item.quantity),
    }));
    perf.lap("response-build");
    perf.log("GET /api/stats", {
      shopName: shopName || null,
      rangeMode: rangeMode || null,
      rangeDays: businessTrend.length,
      purchaseOrders: purchaseOrdersInRange.length,
      autoPickOrders: filteredAutoPickOrdersInRange.length,
    });

    return NextResponse.json({
      shopCount,
      productCount,
      totalStock,
      lowStockCount,
      totalValue,
      recentInboundItems: transformedInboundItems,
      pendingInboundCount: pendingOrderCount,
      pendingInboundAmount,
      rangeStart: formatDateKey(startDate),
      rangeEnd: formatDateKey(endDate),
      rangeDays: businessTrend.length,
      purchaseAmount,
      outboundAmount,
      purchaseOrderCount: purchaseOrdersInRange.length,
      outboundOrderCount: filteredAutoPickOrdersInRange.length,
      activeShopCount,
      zeroCostProductCount,
      zeroStockProductCount,
      duplicateSourceProductCount,
      userPaid,
      platformCommission,
      deliveryExpense,
      productCost,
      promotionExpense,
      brushExpense,
      otherExpense,
      netProfit,
      platformMatrix: {
        columns: platformMatrixColumns,
        trueOrderTotal: platformMatrixColumns.reduce((sum, item) => sum + item.trueOrderCount, 0),
        brushOrderTotal: platformMatrixColumns.reduce((sum, item) => sum + item.brushOrderCount, 0),
        grandTotal: platformMatrixColumns.reduce((sum, item) => sum + item.totalCount, 0),
      },
      businessTrend,
      platformBusinessTrend,
      shopBreakdown,
      alerts,
    }, {
      headers: perf.headers(),
    });
  } catch (error) {
    if (error instanceof Error) {
      console.error("Failed to fetch stats (Detailed):", error.message, error.stack);
    } else {
      console.error("Failed to fetch stats (Detailed):", error);
    }
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
