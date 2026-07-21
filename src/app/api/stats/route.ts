import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { FinanceMath } from "@/lib/math";
import { normalizeAutoPickIntegrationConfig, resolveAutoPickMatchedShopName } from "@/lib/autoPickOrders";
import { isAutoPickOrderCancelledStatus, isAutoPickOrderDeletedStatus } from "@/lib/autoPickOrderStatus";
import { createRequestPerfTracker } from "@/lib/perf";
import { getStorageStrategy } from "@/lib/storage";
import { formatLocalDate, parseAsShanghaiTime } from "@/lib/dateUtils";
import { isPrismaMissingColumnError } from "@/lib/prismaSchemaCompat";
import { getOutboundReturnTotals, parseOutboundReturnMeta } from "@/lib/outboundReturnMeta";

const SHANGHAI_DAY_MS = 24 * 60 * 60 * 1000;

function formatDateKey(date: Date | string) {
  return formatLocalDate(date).replace(/\//g, "-");
}

function formatDateLabel(date: Date | string) {
  const key = formatDateKey(date);
  return key.slice(5);
}

function buildDateSeries(start: Date, end: Date) {
  const list: Array<{ date: string; label: string }> = [];
  let cursorMs = parseAsShanghaiTime(formatDateKey(start)).getTime();
  const lastMs = parseAsShanghaiTime(formatDateKey(end)).getTime();
  while (cursorMs <= lastMs) {
    const cursor = new Date(cursorMs);
    list.push({ date: formatDateKey(cursor), label: formatDateLabel(cursor) });
    cursorMs += SHANGHAI_DAY_MS;
  }
  return list;
}

function extractShopNameFromNote(note: string | null | undefined) {
  const match = String(note || "").match(/\[店铺:([^\]]+)\]/);
  return String(match?.[1] || "").trim();
}

function extractOrderNoFromNote(note: string | null | undefined) {
  const match = String(note || "").match(/平台单号:\s*([^\s|]+)/);
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

function readMainSystemSelfDeliveryFlag(rawPayload: unknown) {
  const systemMeta = readAutoPickSystemMeta(rawPayload);
  const marker = systemMeta?.mainSystemSelfDelivery;
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) {
    return false;
  }
  return Boolean((marker as Record<string, unknown>).triggered);
}

function isVoidedOfflineOrder(order: {
  platform?: string | null;
  rawPayload?: unknown;
  status?: string | null;
}) {
  if (String(order.platform || "").trim() !== "线下交易") {
    return false;
  }
  if (isAutoPickOrderDeletedStatus(order.status)) {
    return true;
  }
  const systemMeta = readAutoPickSystemMeta(order.rawPayload);
  const voided = systemMeta?.manualOfflineVoided;
  return Boolean(voided && typeof voided === "object" && !Array.isArray(voided));
}

const DASHBOARD_PLATFORMS = ["美团", "京东", "淘宝", "线下交易"] as const;

type OutboundCostLookupRow = {
  note: string | null;
  items: Array<{
    quantity: number;
    costSnapshot?: unknown;
    shopProduct: {
      costPrice: number;
    } | null;
    product: {
      costPrice: number;
    } | null;
  }>;
};

function resolveRefundAdjustedIncomeMetrics(options: {
  expectedIncome: number | null | undefined;
  platformCommission: number | null | undefined;
  actualPaid: number | null | undefined;
  refundAmount: number | null | undefined;
}) {
  const expectedIncome = Math.max(0, Number(options.expectedIncome || 0));
  const platformCommission = Math.max(0, Number(options.platformCommission || 0));
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

  const grossBase = Math.max(actualPaid, expectedIncome + platformCommission);
  if (grossBase <= 0) {
    return {
      actualPaid,
      expectedIncome,
      platformCommission,
      refundedExpectedIncome: refundAmount,
      refundedCommission: 0,
    };
  }

  const commissionRatio = platformCommission > 0
    ? Math.min(1, Math.max(0, platformCommission / grossBase))
    : 0;
  const refundedCommission = Math.min(
    platformCommission,
    Math.max(0, Math.round(refundAmount * commissionRatio))
  );
  const refundedExpectedIncome = Math.min(
    expectedIncome,
    Math.max(0, refundAmount - refundedCommission)
  );

  const adjustedPlatformCommission = Math.max(0, platformCommission - refundedCommission);
  const adjustedExpectedIncome = Math.max(0, expectedIncome - refundedExpectedIncome);

  return {
    actualPaid,
    expectedIncome: adjustedExpectedIncome,
    platformCommission: adjustedPlatformCommission,
    refundedExpectedIncome,
    refundedCommission,
  };
}

function isJDPlatform(platform: string | null | undefined) {
  const normalized = String(platform || "").trim().toLowerCase();
  return normalized === "jd" || normalized.includes("jingdong") || normalized.includes("jddj") || normalized.includes("京东");
}

function resolveDashboardIncomeMetrics(
  platform: string | null | undefined,
  expectedIncome: number | null | undefined,
  actualPaid: number | null | undefined,
  fallbackCommission: number | null | undefined
) {
  const paid = Math.max(0, Number(actualPaid || 0));
  const explicitExpectedIncome = Number(expectedIncome);
  const explicitCommission = Math.max(0, Math.abs(Number(fallbackCommission || 0)));

  if (Number.isFinite(explicitExpectedIncome)) {
    const resolvedExpectedIncome = Math.max(0, explicitExpectedIncome);
    const derivedCommission = Math.max(0, paid - resolvedExpectedIncome);
    return {
      expectedIncome: resolvedExpectedIncome,
      platformCommission: Math.max(derivedCommission, explicitCommission),
    };
  }

  if (isJDPlatform(platform)) {
    const settledBase = Math.max(0, paid - 1);
    const platformCommission = Math.max(0, FinanceMath.multiply(settledBase, 0.06));
    const resolvedExpectedIncome = Math.max(0, FinanceMath.add(settledBase, -platformCommission));
    return {
      expectedIncome: resolvedExpectedIncome,
      platformCommission,
    };
  }

  return {
    expectedIncome: Math.max(0, FinanceMath.add(paid, -explicitCommission)),
    platformCommission: explicitCommission,
  };
}

export async function GET(request: NextRequest) {
  const perf = createRequestPerfTracker(request);
  try {
    const user = await getAuthorizedUser("dashboard:read");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const storage = await getStorageStrategy();

    const permissionsObj = user?.permissions && typeof user.permissions === "object" && !Array.isArray(user.permissions)
      ? user.permissions as Record<string, unknown>
      : {};
    const integrationConfig = normalizeAutoPickIntegrationConfig(permissionsObj.autoPickIntegration);
    const defaultBrushCommission = integrationConfig.defaultBrushCommission || 0;

    const rangeMode = request.nextUrl.searchParams.get("range");
    const shopName = (request.nextUrl.searchParams.get("shopName") || "").trim();
    const settings = await prisma.systemSetting.findFirst({
      where: { userId: user.id },
    });
    const threshold = settings?.lowStockThreshold ?? 10;

    const endDateKey = (request.nextUrl.searchParams.get("endDate") || formatDateKey(new Date())).trim();
    let startDateKey = (request.nextUrl.searchParams.get("startDate") || "").trim();
    if (!startDateKey) {
      const defaultStart = new Date(parseAsShanghaiTime(endDateKey).getTime() - 29 * SHANGHAI_DAY_MS);
      startDateKey = formatDateKey(defaultStart);
    }

    const endDate = parseAsShanghaiTime(`${endDateKey} 23:59:59`);
    let startDate = parseAsShanghaiTime(startDateKey);

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
        startDate = parseAsShanghaiTime(formatDateKey(new Date(Math.min(...candidates.map((item) => item.getTime())))));
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
          purchaseOrder: { select: { id: true, date: true, status: true, shopName: true } },
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
          orderNo: true,
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
          platformOrderId: true,
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
    function getDeliveryFee(delivery: unknown) {
      if (!delivery || typeof delivery !== "object" || Array.isArray(delivery)) {
        return 0;
      }
      const value = Number((delivery as Record<string, unknown>).sendFee || 0);
      return Number.isFinite(value) ? Math.max(0, value) : 0;
    }

    function parseOutboundCostSnapshot(value: unknown) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
      }
      const raw = value as Record<string, unknown>;
      const quantity = Number(raw.quantity || 0);
      const totalCost = Number(raw.totalCost || 0);
      const averageUnitCost = Number(raw.averageUnitCost || 0);
      return {
        quantity: Number.isFinite(quantity) ? quantity : 0,
        totalCost: Number.isFinite(totalCost) ? totalCost : 0,
        averageUnitCost: Number.isFinite(averageUnitCost) ? averageUnitCost : 0,
      };
    }

    const purchaseAmount = purchaseOrdersInRange.reduce((sum, order) => FinanceMath.add(sum, order.totalAmount || 0), 0);
    let brushExpense = brushOrdersInRange
      .filter((order) => !order.platformOrderId)
      .reduce(
        (sum, order) => FinanceMath.add(sum, FinanceMath.add((order.paymentAmount || 0) - (order.receivedAmount || 0), order.commission || 0)),
        0
      );
    const outboundLookupOrderNos = Array.from(new Set(
      filteredAutoPickOrdersInRange
        .filter((order) => !isVoidedOfflineOrder(order))
        .map((order) => String(order.orderNo || "").trim())
        .filter(Boolean)
    ));
    const outboundOrdersForCost: OutboundCostLookupRow[] = [];
    if (outboundLookupOrderNos.length > 0) {
      try {
        outboundOrdersForCost.push(...await prisma.outboundOrder.findMany({
          where: {
            userId: user.id,
            OR: outboundLookupOrderNos.map((orderNo) => ({
              note: { contains: `平台单号: ${orderNo}` },
            })),
          },
          select: {
            note: true,
            items: {
              select: {
                quantity: true,
                costSnapshot: true,
                shopProduct: {
                  select: {
                    costPrice: true,
                  },
                },
                product: {
                  select: {
                    costPrice: true,
                  },
                },
              },
            },
          },
        }));
      } catch (error) {
        if (!isPrismaMissingColumnError(error, "OutboundOrderItem.costSnapshot")) {
          throw error;
        }

        outboundOrdersForCost.push(...await prisma.outboundOrder.findMany({
          where: {
            userId: user.id,
            OR: outboundLookupOrderNos.map((orderNo) => ({
              note: { contains: `平台单号: ${orderNo}` },
            })),
          },
          select: {
            note: true,
            items: {
              select: {
                quantity: true,
                shopProduct: {
                  select: {
                    costPrice: true,
                  },
                },
                product: {
                  select: {
                    costPrice: true,
                  },
                },
              },
            },
          },
        }));
      }
    }
    const outboundMetaByOrderNo = new Map<string, {
      productCost: number;
      missingCostItemCount: number;
      refundAmount: number;
      extraExpense: number;
      returnedCost: number;
    }>();
    outboundOrdersForCost.forEach((outbound) => {
      const orderNo = extractOrderNoFromNote(outbound.note);
      if (!orderNo) return;
      // 同一平台订单号只取第一笔出库单的成本，跳过重复录入的出库单，避免成本被累加多次
      if (outboundMetaByOrderNo.has(orderNo)) return;
      let missingCostItemCount = 0;
      const returnTotals = getOutboundReturnTotals(parseOutboundReturnMeta(outbound.note).returns);
      const outboundCost = outbound.items.reduce((sum, item) => {
        const snapshot = parseOutboundCostSnapshot(item.costSnapshot);
        const unitCost = snapshot
          ? Number(snapshot.averageUnitCost || 0)
          : (Number(item.shopProduct?.costPrice) || 0);
        if (unitCost <= 0) {
          missingCostItemCount += 1;
        }
        return snapshot
          ? FinanceMath.add(sum, Number(snapshot.totalCost || 0))
          : FinanceMath.add(sum, FinanceMath.multiply(unitCost, item.quantity || 0));
      }, 0);
      outboundMetaByOrderNo.set(orderNo, {
        productCost: FinanceMath.add(outboundCost, -returnTotals.returnedCost),
        missingCostItemCount,
        refundAmount: returnTotals.refundAmount,
        extraExpense: returnTotals.extraExpense,
        returnedCost: returnTotals.returnedCost,
      });
    });

    let userPaid = 0;
    let platformCommission = 0;
    let deliveryExpense = 0;
    let productCost = 0;
    let returnExtraExpense = 0;

    filteredAutoPickOrdersInRange.forEach((order) => {
      const isCancelled = isAutoPickOrderCancelledStatus(order.status)
        || isAutoPickOrderDeletedStatus(order.status)
        || isVoidedOfflineOrder(order);
      if (!isCancelled) {
        const paidYuan = (order.actualPaid || 0) / 100;
        const isOffline = order.platform === "线下交易";
        const deliveryYuan = getDeliveryFee(order.delivery) / 100;
        const metrics = resolveDashboardIncomeMetrics(
          order.platform,
          typeof order.expectedIncome === "number" ? (order.expectedIncome / 100) : null,
          paidYuan,
          Number(order.platformCommission || 0) / 100
        );

        const orderCostMeta = outboundMetaByOrderNo.get(String(order.orderNo || "").trim());
        const orderCostYuan = orderCostMeta?.productCost || 0;
        const returnExtraExpenseYuan = orderCostMeta?.extraExpense || 0;
        const refundAmountYuan = orderCostMeta?.refundAmount || 0;
        const adjustedMetrics = resolveRefundAdjustedIncomeMetrics({
          expectedIncome: metrics.expectedIncome,
          platformCommission: isOffline ? 0 : metrics.platformCommission,
          actualPaid: paidYuan,
          refundAmount: refundAmountYuan,
        });
        const adjustedPaidYuan = paidYuan;
        const commissionYuan = adjustedMetrics.platformCommission;
        const expectedIncomeYuan = adjustedMetrics.expectedIncome;

        const isBrush = readMainSystemSelfDeliveryFlag(order.rawPayload);
        if (!isBrush) {
          userPaid = FinanceMath.add(userPaid, adjustedPaidYuan);
          productCost = FinanceMath.add(productCost, orderCostYuan);
          returnExtraExpense = FinanceMath.add(returnExtraExpense, returnExtraExpenseYuan);
        } else {
          brushExpense = FinanceMath.add(brushExpense, defaultBrushCommission);
          returnExtraExpense = FinanceMath.add(returnExtraExpense, returnExtraExpenseYuan);
        }
        platformCommission = FinanceMath.add(platformCommission, commissionYuan);
        deliveryExpense = FinanceMath.add(deliveryExpense, deliveryYuan);
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
      -platformCommission - deliveryExpense - productCost - returnExtraExpense - promotionExpense - brushExpense - otherExpense
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
      pureProfit: 0,
      platformPureProfit: {} as Record<string, number>,
    });

    const businessTrendMap = new Map<string, ReturnType<typeof createTrendBucket>>();
    dateSeries.forEach((item) => {
      businessTrendMap.set(item.date, createTrendBucket());
    });

    const normalizePlatform = (value: string | null | undefined) => {
      const raw = String(value || "").trim();
      if (!raw) return "线下交易";
      if (raw.includes("美团")) return "美团";
      if (raw.includes("京东")) return "京东";
      if (raw.includes("淘宝") || raw.includes("天猫")) return "淘宝";
      return "线下交易";
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
      const isOther = isAutoPickOrderCancelledStatus(order.status)
        || isAutoPickOrderDeletedStatus(order.status)
        || isVoidedOfflineOrder(order);

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
        const isOffline = order.platform === "线下交易";
        const deliveryYuan = getDeliveryFee(order.delivery) / 100;
        const metrics = resolveDashboardIncomeMetrics(
          order.platform,
          typeof order.expectedIncome === "number" ? (order.expectedIncome / 100) : null,
          paidYuan,
          Number(order.platformCommission || 0) / 100
        );
        const orderCostMeta = outboundMetaByOrderNo.get(String(order.orderNo || "").trim());
        const refundAmountYuan = orderCostMeta?.refundAmount || 0;
        const returnExtraExpenseYuan = orderCostMeta?.extraExpense || 0;
        const adjustedMetrics = resolveRefundAdjustedIncomeMetrics({
          expectedIncome: metrics.expectedIncome,
          platformCommission: isOffline ? 0 : metrics.platformCommission,
          actualPaid: paidYuan,
          refundAmount: refundAmountYuan,
        });
        const adjustedPaidYuan = paidYuan;
        const commissionYuan = adjustedMetrics.platformCommission;
        const expectedIncomeYuan = adjustedMetrics.expectedIncome;

        if (!isBrush) {
          if (point) {
            point.userPaid = FinanceMath.add(point.userPaid, adjustedPaidYuan);
          }
          if (platformPoint) {
            platformPoint.userPaid = FinanceMath.add(platformPoint.userPaid, adjustedPaidYuan);
          }
        }
        if (point) {
          point.platformCommission = FinanceMath.add(point.platformCommission, commissionYuan);
          point.deliveryExpense = FinanceMath.add(point.deliveryExpense, deliveryYuan);
        }
        if (platformPoint) {
          platformPoint.platformCommission = FinanceMath.add(platformPoint.platformCommission, commissionYuan);
          platformPoint.deliveryExpense = FinanceMath.add(platformPoint.deliveryExpense, deliveryYuan);
        }

        if (isBrush) {
          if (point) {
            point.brushPaid = FinanceMath.add(point.brushPaid, adjustedPaidYuan);
            point.pureProfit = FinanceMath.add(point.pureProfit, -commissionYuan - deliveryYuan - defaultBrushCommission - returnExtraExpenseYuan);
            point.platformPureProfit[platform] = FinanceMath.add(point.platformPureProfit[platform] || 0, -commissionYuan - deliveryYuan - defaultBrushCommission - returnExtraExpenseYuan);
          }
          if (platformPoint) {
            platformPoint.brushPaid = FinanceMath.add(platformPoint.brushPaid, adjustedPaidYuan);
            platformPoint.pureProfit = FinanceMath.add(platformPoint.pureProfit, -commissionYuan - deliveryYuan - defaultBrushCommission - returnExtraExpenseYuan);
            platformPoint.platformPureProfit[platform] = FinanceMath.add(platformPoint.platformPureProfit[platform] || 0, -commissionYuan - deliveryYuan - defaultBrushCommission - returnExtraExpenseYuan);
          }
        } else {
          const orderCostYuan = orderCostMeta?.productCost || 0;
          const returnExtraExpenseYuan = orderCostMeta?.extraExpense || 0;

          if (point) {
            point.productCost = FinanceMath.add(point.productCost, orderCostYuan);
          }
          if (platformPoint) {
            platformPoint.productCost = FinanceMath.add(platformPoint.productCost, orderCostYuan);
          }

          const matchedShopName = resolveAutoPickMatchedShopName(order, user.permissions) || "";
          const isOffline = order.platform === "线下交易";
          const rate = isOffline ? 0 : (shopRateMap.get(matchedShopName) ?? 0.06);
          const deliveryYuan = getDeliveryFee(order.delivery) / 100;
          const hasReadyCost = Boolean(orderCostMeta) && (orderCostMeta?.missingCostItemCount || 0) <= 0;
          const pureProfit = hasReadyCost
            ? FinanceMath.add(
                FinanceMath.multiply(expectedIncomeYuan, 1 - rate),
                -deliveryYuan - orderCostYuan - returnExtraExpenseYuan
              )
            : 0;

          if (point) {
            point.pureProfit = FinanceMath.add(point.pureProfit, pureProfit);
            point.platformPureProfit[platform] = FinanceMath.add(point.platformPureProfit[platform] || 0, pureProfit);
          }
          if (platformPoint) {
            platformPoint.pureProfit = FinanceMath.add(platformPoint.pureProfit, pureProfit);
            platformPoint.platformPureProfit[platform] = FinanceMath.add(platformPoint.platformPureProfit[platform] || 0, pureProfit);
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
      if (order.platformOrderId) return; // 排除自动同步的订单，自配送订单的刷单佣金已合并在订单利润 pureProfit 中扣除
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
          point?.pureProfit || 0,
          -(point?.promotionExpense || 0) - (point?.brushExpense || 0)
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
          promotionExpense: point?.promotionExpense || 0,
          pureProfit: point?.pureProfit || 0,
          platformPureProfit: point?.platformPureProfit || {},
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
      product: item.product
        ? {
            ...item.product,
            image: item.product.image ? storage.resolveUrl(item.product.image) : null,
          }
        : null,
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
