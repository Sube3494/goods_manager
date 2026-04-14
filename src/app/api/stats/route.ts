import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { FinanceMath } from "@/lib/math";

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
  return date.toISOString().slice(0, 10);
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

const DASHBOARD_PLATFORMS = ["美团", "京东", "淘宝", "其他"] as const;

export async function GET(request: NextRequest) {
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
      const [firstPurchase, firstOutbound, firstBrush, firstSettlement, firstShopProduct] = await Promise.all([
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
      ]);

      const candidates = [
        firstPurchase?.date,
        firstOutbound?.date,
        firstBrush?.date,
        firstSettlement?.date,
        firstShopProduct?.createdAt,
      ].filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()));

      if (candidates.length > 0) {
        startDate = startOfDay(new Date(Math.min(...candidates.map((item) => item.getTime()))));
      }
    }

    const [shopCount, shopProductRows, recentInboundItems, purchaseOrdersInRange, outboundOrdersInRange, pendingOrders] = await Promise.all([
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
    ]);

    const [brushOrdersInRange, settlementsInRange] = await Promise.all([
      prisma.brushOrder.findMany({
        where: {
          userId: user.id,
          ...(shopName ? { shopName } : {}),
          date: { gte: startDate, lte: endDate },
        },
        select: {
          id: true,
          date: true,
          type: true,
          paymentAmount: true,
          receivedAmount: true,
          commission: true,
        },
        orderBy: { date: "asc" },
      }),
      prisma.settlement.findMany({
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
          date: { gte: startDate, lte: endDate },
        },
        select: {
          id: true,
          date: true,
          serviceFee: true,
          items: {
            select: {
              platformName: true,
              received: true,
              brushing: true,
            },
          },
        },
      }),
    ]);

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
    const activeShopCount = new Set(shopProductRows.filter((item) => (item.stock || 0) > 0).map((item) => item.shopId)).size;
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

    const purchaseAmount = purchaseOrdersInRange.reduce((sum, order) => FinanceMath.add(sum, order.totalAmount || 0), 0);
    const outboundAmount = outboundOrdersInRange.reduce(
      (sum, order) => FinanceMath.add(sum, order.items.reduce((inner, item) => FinanceMath.add(inner, FinanceMath.multiply(item.price || 0, item.quantity || 0)), 0)),
      0
    );
    const brushExpense = brushOrdersInRange.reduce(
      (sum, order) => FinanceMath.add(sum, FinanceMath.add((order.paymentAmount || 0) - (order.receivedAmount || 0), order.commission || 0)),
      0
    );
    const platformCommission = settlementsInRange.reduce((sum, item) => FinanceMath.add(sum, item.serviceFee || 0), 0);
    const userPaid = outboundAmount;
    const promotionExpense = 0;
    const otherExpense = 0;
    const deliveryExpense = 0;

    const outboundProductCost = await prisma.outboundOrderItem.findMany({
      where: {
        outboundOrder: {
          userId: user.id,
          ...(shopName ? { note: { contains: `[店铺:${shopName}]` } } : {}),
          date: { gte: startDate, lte: endDate },
        },
      },
      select: {
        quantity: true,
        shopProduct: { select: { costPrice: true } },
        product: { select: { costPrice: true } },
        outboundOrder: { select: { date: true, note: true } },
      },
    });

    const productCost = outboundProductCost.reduce((sum, item) => {
      const unitCost = item.shopProduct?.costPrice ?? item.product?.costPrice ?? 0;
      return FinanceMath.add(sum, FinanceMath.multiply(unitCost, item.quantity || 0));
    }, 0);

    const netProfit = FinanceMath.add(
      userPaid,
      -platformCommission - deliveryExpense - productCost - promotionExpense - brushExpense - otherExpense
    );

    const dateSeries = buildDateSeries(startDate, endDate);
    const createTrendBucket = () => ({
      trueOrderCount: 0,
      brushOrderCount: 0,
      productCost: 0,
      brushExpense: 0,
      netProfit: 0,
    });

    const businessTrendMap = new Map<string, {
      trueOrderCount: number;
      brushOrderCount: number;
      productCost: number;
      brushExpense: number;
      netProfit: number;
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

    const extractPlatformFromNote = (note: string | null | undefined) => {
      const match = String(note || "").match(/\[([^\[\]]+)导入\]/);
      return normalizePlatform(match?.[1]);
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

    outboundOrdersInRange.forEach((order) => {
      const key = formatDateKey(new Date(order.date));
      const point = businessTrendMap.get(key);
      const platform = extractPlatformFromNote((order as { note?: string | null }).note);
      const platformPoint = platformTrendMaps.get(platform)?.get(key);
      if (point) {
        point.trueOrderCount += 1;
      }
      if (platformPoint) {
        platformPoint.trueOrderCount += 1;
      }
      const current = platformBuckets.get(platform) || { trueOrderCount: 0, brushOrderCount: 0 };
      current.trueOrderCount += 1;
      platformBuckets.set(platform, current);
    });

    brushOrdersInRange.forEach((order) => {
      const key = formatDateKey(new Date(order.date));
      const point = businessTrendMap.get(key);
      const expense = FinanceMath.add((order.paymentAmount || 0) - (order.receivedAmount || 0), order.commission || 0);
      const platform = normalizePlatform(order.type);
      const platformPoint = platformTrendMaps.get(platform)?.get(key);
      if (point) {
        point.brushOrderCount += 1;
        point.brushExpense = FinanceMath.add(point.brushExpense, expense);
      }
      if (platformPoint) {
        platformPoint.brushOrderCount += 1;
        platformPoint.brushExpense = FinanceMath.add(platformPoint.brushExpense, expense);
      }
      const current = platformBuckets.get(platform) || { trueOrderCount: 0, brushOrderCount: 0 };
      current.brushOrderCount += 1;
      platformBuckets.set(platform, current);
    });

    outboundProductCost.forEach((item) => {
      const key = formatDateKey(new Date(item.outboundOrder.date));
      const point = businessTrendMap.get(key);
      const platform = extractPlatformFromNote(item.outboundOrder.note);
      const platformPoint = platformTrendMaps.get(platform)?.get(key);
      if (!point) return;
      const unitCost = item.shopProduct?.costPrice ?? item.product?.costPrice ?? 0;
      const cost = FinanceMath.multiply(unitCost, item.quantity || 0);
      point.productCost = FinanceMath.add(point.productCost, cost);
      if (platformPoint) {
        platformPoint.productCost = FinanceMath.add(platformPoint.productCost, cost);
      }
    });

    settlementsInRange.forEach((settlement) => {
      const key = formatDateKey(new Date(settlement.date));
      const point = businessTrendMap.get(key);
      if (!point) return;
      const trueRevenue = settlement.items.reduce((sum, item) => FinanceMath.add(sum, item.received || 0), 0);
      point.netProfit = FinanceMath.add(point.netProfit, FinanceMath.add(trueRevenue, -(settlement.serviceFee || 0)));

      settlement.items.forEach((item) => {
        const platform = normalizePlatform(item.platformName);
        const platformPoint = platformTrendMaps.get(platform)?.get(key);
        if (!platformPoint) return;
        const received = item.received || 0;
        const serviceFeeShare = trueRevenue > 0
          ? FinanceMath.multiply(settlement.serviceFee || 0, received / trueRevenue)
          : 0;
        platformPoint.netProfit = FinanceMath.add(
          platformPoint.netProfit,
          FinanceMath.add(received, -serviceFeeShare)
        );
      });
    });

    const buildTrendSeries = (source: Map<string, ReturnType<typeof createTrendBucket>>) => {
      let cumulativeOrders = 0;
      return dateSeries.map((item) => {
        const point = source.get(item.date);
        const orderCount = (point?.trueOrderCount || 0) + (point?.brushOrderCount || 0);
        cumulativeOrders += orderCount;
        return {
          date: item.date,
          label: item.label,
          trueOrderCount: point?.trueOrderCount || 0,
          brushOrderCount: point?.brushOrderCount || 0,
          orderCount,
          cumulativeOrderCount: cumulativeOrders,
          productCost: point?.productCost || 0,
          brushExpense: point?.brushExpense || 0,
          netProfit: FinanceMath.add(point?.netProfit || 0, -((point?.productCost || 0) + (point?.brushExpense || 0))),
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
      outboundOrderCount: outboundOrdersInRange.length,
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
