import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { hasAdminAccess } from "@/lib/permissions";
import { isAutoPickOrderCancelledStatus, isAutoPickOrderDeletedStatus } from "@/lib/autoPickOrderStatus";
import { resolveAutoPickMatchedShopName } from "@/lib/autoPickOrders";

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

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthorizedUser("order:manage");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requestedUserId = String(request.nextUrl.searchParams.get("userId") || "").trim();
    const canManageMembers = user.role === "SUPER_ADMIN"
      || hasAdminAccess(user, "members:manage")
      || hasAdminAccess(user, "members:status")
      || hasAdminAccess(user, "whitelist:manage")
      || hasAdminAccess(user, "roles:manage")
      || String(user.roleProfile?.name || "").includes("管理");
    const targetUserId = requestedUserId && canManageMembers ? requestedUserId : user.id;

    const startDateStr = request.nextUrl.searchParams.get("startDate");
    const endDateStr = request.nextUrl.searchParams.get("endDate");
    // 可选：按店铺过滤推广费数据（为空则汇总所有店铺）
    const shopName = request.nextUrl.searchParams.get("shopName") || null;

    if (!startDateStr || !endDateStr) {
      return NextResponse.json({ error: "Missing startDate or endDate" }, { status: 400 });
    }

    const startDate = startOfDay(new Date(startDateStr));
    const endDate = endOfDay(new Date(endDateStr));

    // 1. 获取时间范围内的推广费记录（可按店铺过滤）
    const promotionExpenses = await prisma.dailyPromotionExpense.findMany({
      where: {
        userId: targetUserId,
        date: {
          gte: startDate,
          lte: endDate,
        },
        ...(shopName ? { shopName } : {}),
      },
      select: {
        date: true,
        shopName: true,
        amount: true,
        amountMeituan: true,
        amountJingdong: true,
        amountTaobao: true,
      },
    });

    // 2. 获取订单用于统计真实订单数
    const orders = await prisma.autoPickOrder.findMany({
      where: {
        userId: targetUserId,
        orderTime: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        status: true,
        orderTime: true,
        rawPayload: true,
        platform: true,
        shopId: true,
      },
    });

    // 3. 初始化日期网格数据
    const dataMap: Record<string, {
      promotionAmount: number;
      amountMeituan: number;
      amountJingdong: number;
      amountTaobao: number;
      amountOther: number;
      realOrderCount: number;
      realOrderMeituan: number;
      realOrderJingdong: number;
      realOrderTaobao: number;
      realOrderDoudian: number;
      brushOrderCount: number;
      brushOrderMeituan: number;
      brushOrderJingdong: number;
      brushOrderTaobao: number;
      brushOrderDoudian: number;
      cancelledOrderCount: number;
      cancelledOrderMeituan: number;
      cancelledOrderJingdong: number;
      cancelledOrderTaobao: number;
      cancelledOrderDoudian: number;
      // 各店铺的推广费明细（仅在未过滤时携带，用于悬停展示）
      shopBreakdown: Record<string, number>;
    }> = {};

    const cursor = new Date(startDate);
    const endCursor = new Date(endDate);
    while (cursor <= endCursor) {
      const key = formatDateKey(cursor);
      dataMap[key] = {
        promotionAmount: 0,
        amountMeituan: 0,
        amountJingdong: 0,
        amountTaobao: 0,
        amountOther: 0,
        realOrderCount: 0,
        realOrderMeituan: 0,
        realOrderJingdong: 0,
        realOrderTaobao: 0,
        realOrderDoudian: 0,
        brushOrderCount: 0,
        brushOrderMeituan: 0,
        brushOrderJingdong: 0,
        brushOrderTaobao: 0,
        brushOrderDoudian: 0,
        cancelledOrderCount: 0,
        cancelledOrderMeituan: 0,
        cancelledOrderJingdong: 0,
        cancelledOrderTaobao: 0,
        cancelledOrderDoudian: 0,
        shopBreakdown: {},
      };
      cursor.setDate(cursor.getDate() + 1);
    }

    // 4. 填充推广费数据（多店铺累加，并记录各店铺明细）
    promotionExpenses.forEach((item) => {
      const key = formatDateKey(new Date(item.date));
      if (dataMap[key]) {
        dataMap[key].promotionAmount += item.amount || 0;
        dataMap[key].amountMeituan += item.amountMeituan || 0;
        dataMap[key].amountJingdong += item.amountJingdong || 0;
        dataMap[key].amountTaobao += item.amountTaobao || 0;
        dataMap[key].amountOther += Math.max(0, (item.amount || 0) - (item.amountMeituan || 0) - (item.amountJingdong || 0) - (item.amountTaobao || 0));
        // 按店铺汇总总推广费（用于日历悬停气泡）
        const name = item.shopName || "默认";
        dataMap[key].shopBreakdown[name] = (dataMap[key].shopBreakdown[name] || 0) + (item.amount || 0);
      }
    });

    // 5. 统计订单数据
    orders.forEach((order) => {
      if (shopName) {
        const matchedShopName = resolveAutoPickMatchedShopName(
          { shopId: order.shopId, rawPayload: order.rawPayload },
          user.permissions
        );
        if (matchedShopName !== shopName) {
          return;
        }
      }

      const key = formatDateKey(new Date(order.orderTime));
      if (dataMap[key]) {
        const isBrush = readMainSystemSelfDeliveryFlag(order.rawPayload);
        const isCancelled = isAutoPickOrderCancelledStatus(order.status) || isAutoPickOrderDeletedStatus(order.status);
        const platform = String(order.platform || "").trim();
        const addPlatformCount = (prefix: "realOrder" | "brushOrder" | "cancelledOrder") => {
          if (platform === "美团") {
            dataMap[key][`${prefix}Meituan`] += 1;
          } else if (platform === "京东") {
            dataMap[key][`${prefix}Jingdong`] += 1;
          } else if (platform === "淘宝") {
            dataMap[key][`${prefix}Taobao`] += 1;
          } else if (platform.includes("抖店") || platform.includes("抖音") || platform.toLowerCase() === "doudian" || platform.toLowerCase() === "douyin") {
            dataMap[key][`${prefix}Doudian`] += 1;
          }
        };

        if (isCancelled) {
          dataMap[key].cancelledOrderCount += 1;
          addPlatformCount("cancelledOrder");
        } else if (isBrush) {
          dataMap[key].brushOrderCount += 1;
          addPlatformCount("brushOrder");
        } else {
          dataMap[key].realOrderCount += 1;
          addPlatformCount("realOrder");
        }
      }
    });

    return NextResponse.json({ success: true, data: dataMap });
  } catch (error) {
    console.error("[Promotion Calendar API GET Error]:", error);
    return NextResponse.json({ error: "Failed to fetch promotion calendar data" }, { status: 500 });
  }
}
