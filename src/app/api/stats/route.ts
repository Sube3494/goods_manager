import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { hasAdminAccess } from "@/lib/permissions";
import { FinanceMath } from "@/lib/math";
import {
  normalizeAutoPickIntegrationConfig,
  resolveAutoPickMatchedShopName,
} from "@/lib/autoPickOrders";
import {
  resolveShopBrushCommission,
  readShopIdFromRawPayload,
  readShopNameFromRawPayload,
  readShopAddressFromRawPayload,
} from "@/lib/shopCommission";
import { isAutoPickOrderCancelledStatus, isAutoPickOrderDeletedStatus } from "@/lib/autoPickOrderStatus";
import { createRequestPerfTracker } from "@/lib/perf";
import { getStorageStrategy } from "@/lib/storage";
import { formatLocalDate, parseAsShanghaiTime } from "@/lib/dateUtils";
import { isPrismaMissingColumnError } from "@/lib/prismaSchemaCompat";
import { getOutboundReturnTotals, parseOutboundReturnMeta } from "@/lib/outboundReturnMeta";
import { getDailyFixedOperatingCost, getDailyUtilityCost, normalizeMonthKey } from "@/lib/operatingCosts";
import { AUTO_INBOUND_NOTE_KEYWORD, AUTO_INBOUND_TYPE, ORDER_SHORTAGE_PURCHASE_NOTE_KEYWORD } from "@/lib/purchaseOrderTypes";
import { isAddressDisabled } from "@/lib/addressBook";
import { normalizeShopNameKey } from "@/lib/shopIdentity";

const SHANGHAI_DAY_MS = 24 * 60 * 60 * 1000;

function formatDateKey(date: Date | string) {
  return formatLocalDate(date).replace(/\//g, "-");
}

function formatDateLabel(date: Date | string) {
  const key = formatDateKey(date);
  return key.slice(5);
}

function resolveAutoPickOrderDateKey(order: {
  orderTime: Date;
}) {
  return formatDateKey(order.orderTime);
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
  const match = String(note || "").match(/平台单号[:：]\s*([^\s|]+)/);
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

function readManualAmountOverride(rawPayload: unknown) {
  const systemMeta = readAutoPickSystemMeta(rawPayload);
  const candidate = systemMeta?.manualAmountOverride;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  const expectedIncome = Number(record.expectedIncome);
  const platformCommission = Number(record.platformCommission);

  if (!Number.isFinite(expectedIncome)) {
    return null;
  }

  return {
    expectedIncome: Math.round(expectedIncome),
    platformCommission: Number.isFinite(platformCommission) ? Math.round(platformCommission) : null,
    onlyExpectedIncome: record.onlyExpectedIncome === true,
  };
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

const DASHBOARD_PLATFORMS = ["美团", "京东", "淘宝", "抖店", "线下交易"] as const;

type OutboundCostLookupRow = {
  note: string | null;
  status?: string | null;
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
  const isOffline = platform === "线下交易" || String(platform || "").toLowerCase() === "other";

  if (isOffline) {
    const finalAmount = Number.isFinite(explicitExpectedIncome) && explicitExpectedIncome > 0
      ? explicitExpectedIncome
      : paid;
    return {
      expectedIncome: finalAmount,
      platformCommission: 0,
    };
  }

  if (Number.isFinite(explicitExpectedIncome)) {
    const resolvedExpectedIncome = Math.max(0, explicitExpectedIncome);
    const derivedCommission = FinanceMath.add(paid, -resolvedExpectedIncome);
    return {
      expectedIncome: resolvedExpectedIncome,
      platformCommission: isJDPlatform(platform) && derivedCommission >= 0
        ? Math.max(derivedCommission, explicitCommission)
        : derivedCommission,
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

    const requestedUserId = String(request.nextUrl.searchParams.get("userId") || request.nextUrl.searchParams.get("targetUserId") || "").trim();
    const canManageMembers = hasAdminAccess(user, "members:manage") || user.role === "SUPER_ADMIN";
    const targetUserId = (canManageMembers && requestedUserId) ? requestedUserId : user.id;

    const targetUserRecord = targetUserId === user.id
      ? user
      : await prisma.user.findUnique({
          where: { id: targetUserId },
          select: { id: true, permissions: true },
        });

    const storage = await getStorageStrategy();

    const permissionsObj = targetUserRecord?.permissions && typeof targetUserRecord.permissions === "object" && !Array.isArray(targetUserRecord.permissions)
      ? targetUserRecord.permissions as Record<string, unknown>
      : {};
    const integrationConfig = normalizeAutoPickIntegrationConfig(permissionsObj.autoPickIntegration);
    const defaultBrushCommission = integrationConfig.defaultBrushCommission || 0;

    const rangeMode = request.nextUrl.searchParams.get("range");
    const shopName = (request.nextUrl.searchParams.get("shopName") || "").trim();
    const settings = await prisma.systemSetting.findFirst({
      where: { userId: targetUserId },
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
            userId: targetUserId,
            ...(shopName ? { shopName } : {}),
          },
          orderBy: { date: "asc" },
          select: { date: true },
        }),
        prisma.outboundOrder.findFirst({
          where: {
            userId: targetUserId,
            ...(shopName ? { note: { contains: `[店铺:${shopName}]` } } : {}),
          },
          orderBy: { date: "asc" },
          select: { date: true },
        }),
        prisma.brushOrder.findFirst({
          where: {
            userId: targetUserId,
            ...(shopName ? { shopName } : {}),
          },
          orderBy: { date: "asc" },
          select: { date: true },
        }),
        prisma.settlement.findFirst({
          where: {
            userId: targetUserId,
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
              userId: targetUserId,
              ...(shopName ? { name: shopName } : {}),
            },
          },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        }),
        prisma.autoPickOrder.findFirst({
          where: {
            userId: targetUserId,
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
        !shopName || resolveAutoPickMatchedShopName(firstAutoPickOrder || {}, permissionsObj) === shopName
          ? firstAutoPickOrder?.orderTime
          : null,
      ].filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()));

      if (candidates.length > 0) {
        startDate = parseAsShanghaiTime(formatDateKey(new Date(Math.min(...candidates.map((item) => item.getTime())))));
      }
    }
    perf.lap("range-bootstrap");

    const [shopCount, localShops, shopProductRows, recentInboundItems, purchaseOrdersInRange, outboundOrdersInRange, pendingOrders, autoPickOrdersInRange] = await Promise.all([
      prisma.shop.count({
        where: {
          userId: targetUserId,
          isSource: true,
          ...(shopName ? { name: shopName } : {}),
        },
      }),
      prisma.shop.findMany({
        where: { userId: targetUserId },
        select: { name: true },
      }),
      prisma.shopProduct.findMany({
        where: {
          shop: {
            userId: targetUserId,
            ...(shopName ? { name: shopName } : {}),
          },
        },
        select: {
          id: true,
          productId: true,
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
            userId: targetUserId,
            status: "Received",
            NOT: [
              { type: AUTO_INBOUND_TYPE },
              { id: { startsWith: "PO-AUTO-" } },
              { note: { contains: AUTO_INBOUND_NOTE_KEYWORD, mode: "insensitive" } },
              { note: { contains: ORDER_SHORTAGE_PURCHASE_NOTE_KEYWORD, mode: "insensitive" } },
            ],
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
          userId: targetUserId,
          ...(shopName ? { shopName } : {}),
          NOT: [
            { type: AUTO_INBOUND_TYPE },
            { id: { startsWith: "PO-AUTO-" } },
            { note: { contains: AUTO_INBOUND_NOTE_KEYWORD, mode: "insensitive" } },
            { note: { contains: ORDER_SHORTAGE_PURCHASE_NOTE_KEYWORD, mode: "insensitive" } },
          ],
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
          userId: targetUserId,
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
          userId: targetUserId,
          status: "Ordered",
          ...(shopName ? { shopName } : {}),
          NOT: [
            { type: AUTO_INBOUND_TYPE },
            { id: { startsWith: "PO-AUTO-" } },
            { note: { contains: AUTO_INBOUND_NOTE_KEYWORD, mode: "insensitive" } },
            { note: { contains: ORDER_SHORTAGE_PURCHASE_NOTE_KEYWORD, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          totalAmount: true,
        },
      }),
      prisma.autoPickOrder.findMany({
        where: {
          userId: targetUserId,
          orderTime: { gte: startDate, lte: endDate },
        },
        select: {
          id: true,
          orderNo: true,
          platform: true,
          status: true,
          orderTime: true,
          shopId: true,
          shopAddress: true,
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
    const localShopByNameKey = new Map(localShops.map((shop) => [normalizeShopNameKey(shop.name), shop.name]));
    const resolveExistingMatchedShopName = (order: Parameters<typeof resolveAutoPickMatchedShopName>[0]) => {
      const matchedName = resolveAutoPickMatchedShopName(order, permissionsObj);
      const nameKey = normalizeShopNameKey(matchedName);
      return nameKey ? localShopByNameKey.get(nameKey) || null : null;
    };

    const [brushOrdersInRange, promotionExpensesInRange] = await Promise.all([
      prisma.brushOrder.findMany({
        where: {
          userId: targetUserId,
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
          userId: targetUserId,
          ...(shopName ? { shopName } : {}),
          date: { gte: startDate, lte: endDate },
        },
        select: {
          date: true,
          amount: true,
          amountMeituan: true,
          amountJingdong: true,
          amountTaobao: true,
        },
      }),
    ]);
    const operatingCostProfiles = await prisma.operatingCostProfile.findMany({
      where: { userId: targetUserId, ...(shopName ? { shopName } : {}) },
    });
    const operatingCostBills = await prisma.operatingCostMonthlyBill.findMany({
      where: { userId: targetUserId, ...(shopName ? { shopName } : {}) },
    });
    perf.lap("secondary-queries");

    const customBrushCommissionMap = new Map<string, number>(
      brushOrdersInRange
        .filter((b): b is typeof b & { platformOrderId: string } => Boolean(b.platformOrderId))
        .map((b) => [b.platformOrderId, b.commission])
    );

    const filteredAutoPickOrdersInRange = shopName
      ? autoPickOrdersInRange.filter((order) => resolveExistingMatchedShopName(order) === shopName)
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
      where: { id: targetUserId },
      select: { shippingAddresses: true }
    });
    const userAddresses = userDb && Array.isArray(userDb.shippingAddresses) 
      ? (userDb.shippingAddresses as Array<Record<string, unknown>>).filter((address) => !isAddressDisabled(address))
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
        outboundOrdersForCost.push(...(await prisma.outboundOrder.findMany({
          where: {
            userId: targetUserId,
            OR: outboundLookupOrderNos.flatMap((orderNo) => [
              { note: { contains: `平台单号: ${orderNo}` } },
              { note: { contains: `平台单号:${orderNo}` } },
              { note: { contains: `平台单号：${orderNo}` } },
              { note: { contains: `平台单号： ${orderNo}` } },
            ]),
          },
          select: {
            note: true,
            status: true,
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
        }) as unknown as OutboundCostLookupRow[]));
      } catch (error) {
        if (!isPrismaMissingColumnError(error, "OutboundOrderItem.costSnapshot")) {
          throw error;
        }

        outboundOrdersForCost.push(...(await prisma.outboundOrder.findMany({
          where: {
            userId: targetUserId,
            OR: outboundLookupOrderNos.flatMap((orderNo) => [
              { note: { contains: `平台单号: ${orderNo}` } },
              { note: { contains: `平台单号:${orderNo}` } },
              { note: { contains: `平台单号：${orderNo}` } },
              { note: { contains: `平台单号： ${orderNo}` } },
            ]),
          },
          select: {
            note: true,
            status: true,
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
        }) as unknown as OutboundCostLookupRow[]));
      }
    }
    const outboundMetaByOrderNo = new Map<string, {
      itemCount: number;
      productCost: number;
      missingCostItemCount: number;
      refundAmount: number;
      extraExpense: number;
      returnedCost: number;
    }>();
    outboundOrdersForCost.forEach((outbound) => {
      const orderNo = extractOrderNoFromNote(outbound.note);
      if (!orderNo) return;
      const isCurrentReturned = outbound.status === "Returned";
      const existing = outboundMetaByOrderNo.get(orderNo);
      // 优先采用有效出库单，避免已退货单或空单覆盖有效单
      if (existing && isCurrentReturned) return;
      if (existing && existing.itemCount > 0 && outbound.items.length === 0) return;

      let missingCostItemCount = 0;
      const returnTotals = getOutboundReturnTotals(parseOutboundReturnMeta(outbound.note).returns);
      const outboundCost = outbound.items.reduce((sum, item) => {
        const snapshot = parseOutboundCostSnapshot(item.costSnapshot);
        const unitCost = snapshot
          ? Number(snapshot.averageUnitCost || 0)
          : (Number(item.shopProduct?.costPrice) || 0);
        const hasCostSnapshot = item.costSnapshot !== null && item.costSnapshot !== undefined;
        if (!hasCostSnapshot && unitCost <= 0) {
          missingCostItemCount += 1;
        }
        return snapshot
          ? FinanceMath.add(sum, Number(snapshot.totalCost || 0))
          : FinanceMath.add(sum, FinanceMath.multiply(unitCost, item.quantity || 0));
      }, 0);
      const effectiveReturnedCost = isCurrentReturned ? returnTotals.returnedCost : 0;
      outboundMetaByOrderNo.set(orderNo, {
        itemCount: outbound.items.length,
        productCost: FinanceMath.add(outboundCost, -effectiveReturnedCost),
        missingCostItemCount,
        refundAmount: returnTotals.refundAmount,
        extraExpense: returnTotals.extraExpense,
        returnedCost: returnTotals.returnedCost,
      });
    });

    let userPaid = 0;
    let platformCommission = 0;
    let companyCommission = 0;
    let deliveryExpense = 0;
    let productCost = 0;
    let returnExtraExpense = 0;

    filteredAutoPickOrdersInRange.forEach((order) => {
      const isCancelled = isAutoPickOrderCancelledStatus(order.status)
        || isAutoPickOrderDeletedStatus(order.status)
        || isVoidedOfflineOrder(order);
      const orderCostMeta = outboundMetaByOrderNo.get(String(order.orderNo || "").trim());
      if (!isCancelled) {
        const manualAmountOverride = readManualAmountOverride(order.rawPayload);
        const isOffline = order.platform === "线下交易" || String(order.platform || "").toLowerCase() === "other";
        let paidYuan = (order.actualPaid || 0) / 100;
        let expectedIncomeCents = manualAmountOverride
          ? manualAmountOverride.expectedIncome
          : typeof order.expectedIncome === "number"
            ? order.expectedIncome
            : null;
        if (isOffline) {
          if (paidYuan <= 0 && typeof expectedIncomeCents === "number" && expectedIncomeCents > 0) {
            paidYuan = expectedIncomeCents / 100;
          } else if ((expectedIncomeCents === null || expectedIncomeCents <= 0) && paidYuan > 0) {
            expectedIncomeCents = Math.round(paidYuan * 100);
          }
        }
        const deliveryYuan = getDeliveryFee(order.delivery) / 100;
        const commissionCents = manualAmountOverride && Number.isFinite(Number(manualAmountOverride.platformCommission))
          ? Number(manualAmountOverride.platformCommission)
          : manualAmountOverride?.onlyExpectedIncome
            ? 0
            : manualAmountOverride
              ? Math.round(Number(expectedIncomeCents || 0) - Number(order.actualPaid || 0))
              : order.platformCommission;
        const metrics = resolveDashboardIncomeMetrics(
          order.platform,
          typeof expectedIncomeCents === "number" ? (expectedIncomeCents / 100) : null,
          paidYuan,
          Number(commissionCents || 0) / 100
        );

        const orderCostYuan = orderCostMeta?.productCost || 0;
        const returnExtraExpenseYuan = orderCostMeta?.extraExpense || 0;
        const refundAmountYuan = Math.max(orderCostMeta?.refundAmount || 0, readRefundAmountFromRawPayload(order.rawPayload) / 100);
        const adjustedMetrics = resolveRefundAdjustedIncomeMetrics({
          expectedIncome: metrics.expectedIncome,
          platformCommission: isOffline ? 0 : metrics.platformCommission,
          actualPaid: paidYuan,
          refundAmount: refundAmountYuan,
        });
        const adjustedPaidYuan = paidYuan;
        const commissionYuan = adjustedMetrics.platformCommission;
        const expectedIncomeYuan = adjustedMetrics.expectedIncome;
        const incomeYuan = (manualAmountOverride || isOffline) ? expectedIncomeYuan : adjustedPaidYuan;

        const isBrush = readMainSystemSelfDeliveryFlag(order.rawPayload);
        const matchedShopName = resolveExistingMatchedShopName(order) || "未匹配店铺";
        const customCommission = order.orderNo ? customBrushCommissionMap.get(order.orderNo) : undefined;
        const orderBrushCommission = typeof customCommission === "number" && customCommission >= 0
          ? customCommission
          : resolveShopBrushCommission(integrationConfig, {
              maiyatianShopId: readShopIdFromRawPayload(order.rawPayload),
              shopName: readShopNameFromRawPayload(order.rawPayload) || order.shopId,
              shopAddress: readShopAddressFromRawPayload(order.rawPayload) || order.shopAddress,
              rawPayload: order.rawPayload,
            });
        if (!isBrush) {
          const companyRate = isOffline ? 0 : (shopRateMap.get(matchedShopName) ?? 0.06);
          userPaid = FinanceMath.add(userPaid, incomeYuan);
          platformCommission = FinanceMath.add(platformCommission, commissionYuan);
          companyCommission = FinanceMath.add(companyCommission, FinanceMath.multiply(expectedIncomeYuan, companyRate));
          productCost = FinanceMath.add(productCost, orderCostYuan);
          returnExtraExpense = FinanceMath.add(returnExtraExpense, returnExtraExpenseYuan);
        } else {
          brushExpense = FinanceMath.add(brushExpense, commissionYuan + orderBrushCommission);
          returnExtraExpense = FinanceMath.add(returnExtraExpense, returnExtraExpenseYuan);
        }
        deliveryExpense = FinanceMath.add(deliveryExpense, deliveryYuan);
      } else {
        if (orderCostMeta && !isRefundableMeituanDelivery(order.platform, order.delivery)) {
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
      operatingExpense: 0,
      pureProfit: 0,
      platformPureProfit: {} as Record<string, number>,
      shopPureProfit: {} as Record<string, number>,
      shopPlatformPureProfit: {} as Record<string, Record<string, number>>,
      platformOrderCount: {} as Record<string, number>,
    });

    const businessTrendMap = new Map<string, ReturnType<typeof createTrendBucket>>();
    dateSeries.forEach((item) => {
      businessTrendMap.set(item.date, createTrendBucket());
    });

    dateSeries.forEach((item) => {
      const point = businessTrendMap.get(item.date);
      if (!point) return;
      const monthKey = normalizeMonthKey(item.date);
      const operatingExpense = operatingCostProfiles.reduce((sum, profile) =>
        FinanceMath.add(sum, getDailyFixedOperatingCost(profile)), 0
      ) + operatingCostBills
        .filter((bill) => normalizeMonthKey(bill.monthKey) === monthKey)
        .reduce((sum, bill) => FinanceMath.add(sum, getDailyUtilityCost(bill)), 0);
      point.operatingExpense = operatingExpense;
    });

    const normalizePlatform = (value: string | null | undefined) => {
      const raw = String(value || "").trim();
      const lower = raw.toLowerCase();
      if (!raw) return "线下交易";
      if (raw.includes("美团") || lower.includes("meituan") || lower === "shangou") return "美团";
      if (raw.includes("京东") || lower.includes("jd") || lower === "daojia") return "京东";
      if (raw.includes("淘宝") || raw.includes("天猫") || lower === "taobao" || lower === "ebai") return "淘宝";
      if (raw.includes("抖店") || raw.includes("抖音") || lower === "doudian" || lower === "douyin") return "抖店";
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
      const key = resolveAutoPickOrderDateKey(order);
      const point = businessTrendMap.get(key);
      const platform = normalizePlatform(order.platform);
      const platformPoint = platformTrendMaps.get(platform)?.get(key);
      const current = platformBuckets.get(platform) || { trueOrderCount: 0, brushOrderCount: 0 };
      const isBrush = readMainSystemSelfDeliveryFlag(order.rawPayload);
      const isOther = isAutoPickOrderCancelledStatus(order.status)
        || isAutoPickOrderDeletedStatus(order.status)
        || isVoidedOfflineOrder(order);
      const orderCostMeta = outboundMetaByOrderNo.get(String(order.orderNo || "").trim());
      const matchedShopName = resolveExistingMatchedShopName(order) || "未匹配店铺";
      const addShopPureProfit = (target: ReturnType<typeof createTrendBucket> | undefined, amount: number) => {
        if (!target || amount === 0) return;
        target.shopPureProfit[matchedShopName] = FinanceMath.add(target.shopPureProfit[matchedShopName] || 0, amount);
        const shopPlatformProfit = target.shopPlatformPureProfit[matchedShopName] || {};
        shopPlatformProfit[platform] = FinanceMath.add(shopPlatformProfit[platform] || 0, amount);
        target.shopPlatformPureProfit[matchedShopName] = shopPlatformProfit;
      };

      if (point) {
        if (isBrush) {
          point.brushOrderCount += 1;
        } else if (isOther) {
          point.otherOrderCount += 1;
        } else {
          point.trueOrderCount += 1;
          point.platformOrderCount[platform] = (point.platformOrderCount[platform] || 0) + 1;
        }
      }
      if (platformPoint) {
        if (isBrush) {
          platformPoint.brushOrderCount += 1;
        } else if (isOther) {
          platformPoint.otherOrderCount += 1;
        } else {
          platformPoint.trueOrderCount += 1;
          platformPoint.platformOrderCount[platform] = (platformPoint.platformOrderCount[platform] || 0) + 1;
        }
      }
      if (isBrush) {
        current.brushOrderCount += 1;
      } else if (!isOther) {
        current.trueOrderCount += 1;
      }
      platformBuckets.set(platform, current);

      if (isOther) {
        const deliveryYuan = orderCostMeta && !isRefundableMeituanDelivery(order.platform, order.delivery)
          ? getDeliveryFee(order.delivery) / 100
          : 0;
        if (deliveryYuan > 0) {
          if (point) {
            point.deliveryExpense = FinanceMath.add(point.deliveryExpense, deliveryYuan);
            point.pureProfit = FinanceMath.add(point.pureProfit, -deliveryYuan);
            point.platformPureProfit[platform] = FinanceMath.add(point.platformPureProfit[platform] || 0, -deliveryYuan);
            addShopPureProfit(point, -deliveryYuan);
          }
          if (platformPoint) {
            platformPoint.deliveryExpense = FinanceMath.add(platformPoint.deliveryExpense, deliveryYuan);
            platformPoint.pureProfit = FinanceMath.add(platformPoint.pureProfit, -deliveryYuan);
            platformPoint.platformPureProfit[platform] = FinanceMath.add(platformPoint.platformPureProfit[platform] || 0, -deliveryYuan);
            addShopPureProfit(platformPoint, -deliveryYuan);
          }
        }
      } else {
        const manualAmountOverride = readManualAmountOverride(order.rawPayload);
        const isOffline = order.platform === "线下交易" || String(order.platform || "").toLowerCase() === "other";
        let paidYuan = (order.actualPaid || 0) / 100;
        let expectedIncomeCents = manualAmountOverride
          ? manualAmountOverride.expectedIncome
          : typeof order.expectedIncome === "number"
            ? order.expectedIncome
            : null;
        if (isOffline) {
          if (paidYuan <= 0 && typeof expectedIncomeCents === "number" && expectedIncomeCents > 0) {
            paidYuan = expectedIncomeCents / 100;
          } else if ((expectedIncomeCents === null || expectedIncomeCents <= 0) && paidYuan > 0) {
            expectedIncomeCents = Math.round(paidYuan * 100);
          }
        }
        const deliveryYuan = getDeliveryFee(order.delivery) / 100;
        const commissionCents = manualAmountOverride && Number.isFinite(Number(manualAmountOverride.platformCommission))
          ? Number(manualAmountOverride.platformCommission)
          : manualAmountOverride?.onlyExpectedIncome
            ? 0
            : manualAmountOverride
              ? Math.round(Number(expectedIncomeCents || 0) - Number(order.actualPaid || 0))
              : order.platformCommission;
        const metrics = resolveDashboardIncomeMetrics(
          order.platform,
          typeof expectedIncomeCents === "number" ? (expectedIncomeCents / 100) : null,
          paidYuan,
          Number(commissionCents || 0) / 100
        );
        const refundAmountYuan = Math.max(orderCostMeta?.refundAmount || 0, readRefundAmountFromRawPayload(order.rawPayload) / 100);
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
        const incomeYuan = (manualAmountOverride || isOffline) ? expectedIncomeYuan : adjustedPaidYuan;

        if (!isBrush) {
          if (point) {
            point.userPaid = FinanceMath.add(point.userPaid, incomeYuan);
          }
          if (platformPoint) {
            platformPoint.userPaid = FinanceMath.add(platformPoint.userPaid, incomeYuan);
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
          const customCommission = order.orderNo ? customBrushCommissionMap.get(order.orderNo) : undefined;
          const orderBrushCommission = typeof customCommission === "number" && customCommission >= 0
            ? customCommission
            : resolveShopBrushCommission(integrationConfig, {
                maiyatianShopId: readShopIdFromRawPayload(order.rawPayload),
                shopName: readShopNameFromRawPayload(order.rawPayload) || order.shopId,
                shopAddress: readShopAddressFromRawPayload(order.rawPayload) || order.shopAddress,
                rawPayload: order.rawPayload,
              });
          const brushPureProfit = -commissionYuan - orderBrushCommission - returnExtraExpenseYuan;
          if (point) {
            point.brushPaid = FinanceMath.add(point.brushPaid, adjustedPaidYuan);
            point.pureProfit = FinanceMath.add(point.pureProfit, brushPureProfit);
            point.platformPureProfit[platform] = FinanceMath.add(point.platformPureProfit[platform] || 0, brushPureProfit);
            addShopPureProfit(point, brushPureProfit);
          }
          if (platformPoint) {
            platformPoint.brushPaid = FinanceMath.add(platformPoint.brushPaid, adjustedPaidYuan);
            platformPoint.pureProfit = FinanceMath.add(platformPoint.pureProfit, brushPureProfit);
            platformPoint.platformPureProfit[platform] = FinanceMath.add(platformPoint.platformPureProfit[platform] || 0, brushPureProfit);
            addShopPureProfit(platformPoint, brushPureProfit);
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

           const isOffline = order.platform === "线下交易";
           const rate = isOffline ? 0 : (shopRateMap.get(matchedShopName) ?? 0.06);
           const deliveryYuan = getDeliveryFee(order.delivery) / 100;
           const isManualDeliveryLoss = isOffline && deliveryYuan > 0 && paidYuan <= 0 && expectedIncomeYuan <= 0;
           const hasReadyCost = isManualDeliveryLoss || (Boolean(orderCostMeta) && (orderCostMeta?.missingCostItemCount || 0) <= 0);
           const pureProfit = isManualDeliveryLoss
             ? -deliveryYuan
             : hasReadyCost
              ? FinanceMath.add(
                  FinanceMath.multiply(expectedIncomeYuan, 1 - rate),
                  -deliveryYuan - orderCostYuan - returnExtraExpenseYuan
                )
             : 0;

          if (point) {
            point.pureProfit = FinanceMath.add(point.pureProfit, pureProfit);
            point.platformPureProfit[platform] = FinanceMath.add(point.platformPureProfit[platform] || 0, pureProfit);
            addShopPureProfit(point, pureProfit);
          }
          if (platformPoint) {
            platformPoint.pureProfit = FinanceMath.add(platformPoint.pureProfit, pureProfit);
            platformPoint.platformPureProfit[platform] = FinanceMath.add(platformPoint.platformPureProfit[platform] || 0, pureProfit);
            addShopPureProfit(platformPoint, pureProfit);
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

      const meituanPoint = platformTrendMaps.get("美团")?.get(key);
      if (meituanPoint && item.amountMeituan) {
        meituanPoint.promotionExpense = FinanceMath.add(meituanPoint.promotionExpense, item.amountMeituan || 0);
      }
      const jingdongPoint = platformTrendMaps.get("京东")?.get(key);
      if (jingdongPoint && item.amountJingdong) {
        jingdongPoint.promotionExpense = FinanceMath.add(jingdongPoint.promotionExpense, item.amountJingdong || 0);
      }
      const taobaoPoint = platformTrendMaps.get("淘宝")?.get(key);
      if (taobaoPoint && item.amountTaobao) {
        taobaoPoint.promotionExpense = FinanceMath.add(taobaoPoint.promotionExpense, item.amountTaobao || 0);
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
          - (point?.operatingExpense || 0)
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
          operatingExpense: point?.operatingExpense || 0,
          pureProfit: point?.pureProfit || 0,
          platformPureProfit: point?.platformPureProfit || {},
          shopPureProfit: point?.shopPureProfit || {},
          shopPlatformPureProfit: point?.shopPlatformPureProfit || {},
          platformOrderCount: point?.platformOrderCount || {},
          netProfit: profit,
        };
      });
    };

    const businessTrend = buildTrendSeries(businessTrendMap);
    const netProfit = businessTrend.reduce(
      (sum, point) => FinanceMath.add(sum, point.netProfit || 0),
      0
    );
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

    const transformedInboundItems = recentInboundItems.map((item) => {
      const matchedShopProduct = shopProductRows.find((sp) =>
        (
          (sp.productId && sp.productId === item.productId) ||
          (sp.sourceProductId && sp.sourceProductId === item.productId) ||
          sp.id === item.productId
        ) &&
        (!item.purchaseOrder?.shopName || sp.shop?.name === item.purchaseOrder.shopName)
      );

      // 店铺商品与模板库严格隔离：只能且只使用店铺本身(ShopProduct)的编号与属性
      const shopProductSku = matchedShopProduct ? (matchedShopProduct.sku || "") : "";
      const cleanSku = String(shopProductSku).replace(/\(自编\)|（自编）/gi, "").trim();

      return {
        id: item.id,
        productId: item.productId,
        product: item.product
          ? {
              ...item.product,
              name: matchedShopProduct?.productName || item.product.name,
              sku: cleanSku || null,
              image: item.product.image ? storage.resolveUrl(item.product.image) : null,
            }
          : null,
        supplier: item.supplier,
        quantity: item.quantity,
        costPrice: item.costPrice,
        purchaseOrder: item.purchaseOrder,
        subtotal: FinanceMath.multiply(item.costPrice, item.quantity),
      };
    });
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
      companyCommission,
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
