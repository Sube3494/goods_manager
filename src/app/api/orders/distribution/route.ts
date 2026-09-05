import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { hasAdminAccess, hasPermission } from "@/lib/permissions";
import { parseAsShanghaiTime } from "@/lib/dateUtils";
import { isAddressDisabled, getAddressDetail } from "@/lib/addressBook";
import { Prisma } from "@prisma/client";
import {
  readShopNameFromRawPayload,
  readShopAddressFromRawPayload,
  readShopIdFromRawPayload,
} from "@/lib/shopCommission";
import {
  buildShopDedupeKey,
  normalizeExternalId,
  normalizeShopNameKey,
  simplifyShopName,
} from "@/lib/shopIdentity";
import { normalizeAutoPickIntegrationConfig } from "@/lib/autoPickOrders";

export const dynamic = "force-dynamic";

function normalizeDisplayPlatform(platform?: string | null) {
  const raw = String(platform || "").trim();
  const lower = raw.toLowerCase();
  if (lower === "other" || !raw) return "线下交易";
  if (lower === "ebai" || lower === "taobao" || raw.includes("淘宝")) return "淘宝";
  if (lower === "doudian" || lower === "douyin" || raw.includes("抖店") || raw.includes("抖音")) return "抖店";
  return raw;
}

function readMainSystemSelfDeliveryFlag(rawPayload: unknown): boolean {
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

export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const requestedUserId = String(searchParams.get("userId") || "").trim();
    const canManageMembers = session.role === "SUPER_ADMIN"
      || hasAdminAccess(session, "members:manage")
      || hasAdminAccess(session, "members:status")
      || hasAdminAccess(session, "whitelist:manage")
      || hasAdminAccess(session, "roles:manage")
      || String(session.roleProfile?.name || "").includes("管理")
      || hasPermission(session, "order:manage");
    const targetUserId = (canManageMembers && requestedUserId) ? requestedUserId : session.id;

    // 1. 读取麦芽田映射配置（用于将第三方原始外卖店名/ID 映射到本地业务门店）
    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { permissions: true },
    });
    const permissions = (user?.permissions && typeof user.permissions === "object") ? (user.permissions as any) : {};
    const integrationConfig = normalizeAutoPickIntegrationConfig(permissions.autoPickIntegration);
    const mappings = integrationConfig.maiyatianShopMappings || [];

    // 2. 查询当前用户的所有有效订单基础信息（轻量级，排除已删除订单），用于动态提取实际产生过订单的门店列表
    const orderRecords = await prisma.autoPickOrder.findMany({
      where: {
        userId: targetUserId,
        NOT: [
          { status: { contains: "删除", mode: "insensitive" } },
          { status: { equals: "delete", mode: "insensitive" } },
          { status: { equals: "deleted", mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        orderNo: true,
        shopId: true,
        shopAddress: true,
        rawPayload: true,
        longitude: true,
        latitude: true,
      },
      orderBy: { orderTime: "desc" },
    });

    // 辅助函数：根据订单本身解析其关联的门店名称与地址
    const resolveStoreForOrder = (order: {
      shopId?: string | null;
      shopAddress?: string | null;
      rawPayload?: unknown;
    }) => {
      const payloadObj = (order.rawPayload && typeof order.rawPayload === "object") ? (order.rawPayload as any) : null;
      const resolvedShop = payloadObj?.systemMeta?.resolvedShop;

      // 优先：系统自动/手动匹配识别好的本地门店
      if (resolvedShop?.name && String(resolvedShop.name).trim()) {
        return {
          name: String(resolvedShop.name).trim(),
          id: resolvedShop.id ? String(resolvedShop.id).trim() : String(resolvedShop.name).trim(),
          address: String(order.shopAddress || readShopAddressFromRawPayload(order.rawPayload) || "").trim(),
        };
      }

      // 次优：通过麦芽田映射规则匹配
      const orderShopId = normalizeExternalId(order.shopId || readShopIdFromRawPayload(order.rawPayload));
      const orderShopName = readShopNameFromRawPayload(order.rawPayload);
      const normOrderShopName = orderShopName ? normalizeShopNameKey(orderShopName) : "";

      if (orderShopId || normOrderShopName) {
        for (const m of mappings) {
          const mShopId = normalizeExternalId(m.maiyatianShopId);
          const mShopName = m.maiyatianShopName ? normalizeShopNameKey(m.maiyatianShopName) : "";
          if ((orderShopId && mShopId && orderShopId === mShopId) || (normOrderShopName && mShopName && (normOrderShopName === mShopName || normOrderShopName.includes(mShopName)))) {
            return {
              name: String(m.localShopName || orderShopName || orderShopId).trim(),
              id: m.maiyatianShopId ? String(m.maiyatianShopId).trim() : String(m.localShopName).trim(),
              address: String(m.maiyatianShopAddress || order.shopAddress || readShopAddressFromRawPayload(order.rawPayload) || "").trim(),
            };
          }
        }
      }

      // 兜底：使用原始外卖店铺名或原始 shopId
      const fallbackName = String(orderShopName || order.shopId || "").trim();
      return {
        name: fallbackName || "其他门店",
        id: String(order.shopId || fallbackName || "other").trim(),
        address: String(order.shopAddress || readShopAddressFromRawPayload(order.rawPayload) || "").trim(),
      };
    };

    // 3. 动态聚合所有产生过订单的门店，并融合用户的配置门店（如苏白、遵义店、zunyi），做到与主页面店铺选项100%对齐
    const shopMap = new Map<string, {
      id: string;
      name: string;
      address: string;
      orderCount: number;
      locatedOrderCount: number;
      longitude: number | null;
      latitude: number | null;
    }>();

    // 先录入用户在系统 Shop 表中维护的店铺
    const userDbShops = await prisma.shop.findMany({
      where: { userId: targetUserId },
      select: { id: true, name: true, address: true, longitude: true, latitude: true },
    });
    for (const s of userDbShops) {
      if (!s.name) continue;
      shopMap.set(s.name, {
        id: s.id,
        name: s.name,
        address: s.address || "",
        orderCount: 0,
        locatedOrderCount: 0,
        longitude: s.longitude || null,
        latitude: s.latitude || null,
      });
    }

    // 录入用户个人资料地址库中的门店（如苏白）
    const rawAddresses = Array.isArray((user as any)?.shippingAddresses) ? ((user as any).shippingAddresses as any[]) : [];
    for (const addr of rawAddresses) {
      const label = String(addr?.label || "").trim();
      if (!label || isAddressDisabled(addr)) continue;
      const existing = shopMap.get(label) || Array.from(shopMap.values()).find((v) => normalizeShopNameKey(v.name) === normalizeShopNameKey(label));
      if (!existing) {
        shopMap.set(label, {
          id: String(addr?.id || label),
          name: label,
          address: getAddressDetail(addr),
          orderCount: 0,
          locatedOrderCount: 0,
          longitude: typeof addr?.longitude === "number" ? addr.longitude : null,
          latitude: typeof addr?.latitude === "number" ? addr.latitude : null,
        });
      }
    }

    // 统计各门店在真实订单中的单量与定位单量
    for (const ord of orderRecords) {
      const storeInfo = resolveStoreForOrder(ord);
      if (!storeInfo.name) continue;

      const hasLocation = typeof ord.longitude === "number" && ord.longitude > 0 && typeof ord.latitude === "number" && ord.latitude > 0;
      let matchedShop = shopMap.get(storeInfo.name);
      if (!matchedShop) {
        matchedShop = Array.from(shopMap.values()).find((v) => normalizeShopNameKey(v.name) === normalizeShopNameKey(storeInfo.name));
      }

      if (!matchedShop) {
        shopMap.set(storeInfo.name, {
          id: storeInfo.id,
          name: storeInfo.name,
          address: storeInfo.address,
          orderCount: 1,
          locatedOrderCount: hasLocation ? 1 : 0,
          longitude: null,
          latitude: null,
        });
      } else {
        matchedShop.orderCount += 1;
        if (hasLocation) matchedShop.locatedOrderCount += 1;
        if (!matchedShop.address && storeInfo.address) {
          matchedShop.address = storeInfo.address;
        }
      }
    }

    // 按订单总量倒序排列，主力门店自动排在最前
    const availableShops = Array.from(shopMap.values()).sort((a, b) => b.orderCount - a.orderCount);

    if (availableShops.length === 0) {
      return NextResponse.json({
        currentShop: null,
        availableShops: [],
        orders: [],
        summary: {
          totalOrders: 0,
          totalPaid: 0,
          avgDistanceKm: 0,
          platformStats: {},
        },
      });
    }

    const requestedShopName = String(searchParams.get("shop") || "").trim();
    const platformFilter = String(searchParams.get("platform") || "").trim();
    const orderTypeFilter = String(searchParams.get("orderType") || "all").trim(); // "all" | "real" | "brush"
    const startDate = String(searchParams.get("startDate") || "").trim();
    const endDate = String(searchParams.get("endDate") || "").trim();

    const isAllShops = !requestedShopName || requestedShopName === "all" || requestedShopName === "全部店铺";

    // 确定当前查看的店铺：支持“全部店铺”全景视图，或指定单店聚焦视图
    let currentShop = isAllShops
      ? {
          id: "all",
          name: "全部店铺",
          address: "",
          longitude: null,
          latitude: null,
        }
      : (availableShops.find((s) => s.name === requestedShopName)
          || availableShops.find((s) => normalizeShopNameKey(s.name) === normalizeShopNameKey(requestedShopName))
          || availableShops[0]);

    // 4. 构建当前门店的订单匹配逻辑
    const doesOrderMatchCurrentShop = (order: {
      shopId?: string | null;
      shopAddress?: string | null;
      rawPayload?: unknown;
    }) => {
      if (isAllShops) return true;
      const storeInfo = resolveStoreForOrder(order);
      if (storeInfo.name === currentShop.name) return true;
      if (normalizeShopNameKey(storeInfo.name) === normalizeShopNameKey(currentShop.name)) return true;
      if (currentShop.id && storeInfo.id === currentShop.id) return true;
      return false;
    };

    // 4. 数据库层过滤构建
    let platformClause: Prisma.AutoPickOrderWhereInput | undefined = undefined;
    if (platformFilter && platformFilter !== "all") {
      if (platformFilter === "线下交易") {
        platformClause = {
          OR: [
            { platform: "线下交易" },
            { platform: "other" },
            { platform: "" },
          ],
        };
      } else {
        platformClause = {
          platform: { equals: platformFilter, mode: "insensitive" },
        };
      }
    }

    const where: Prisma.AutoPickOrderWhereInput = {
      userId: targetUserId,
      ...(platformClause ? platformClause : {}),
      ...(startDate || endDate ? {
        orderTime: {
          ...(startDate ? { gte: parseAsShanghaiTime(startDate) } : {}),
          ...(endDate ? { lte: parseAsShanghaiTime(`${endDate} 23:59:59`) } : {}),
        },
      } : {}),
      NOT: [
        { status: { contains: "删除", mode: "insensitive" } },
        { status: { equals: "delete", mode: "insensitive" } },
        { status: { equals: "deleted", mode: "insensitive" } },
      ],
      longitude: { not: null, gt: 0 },
      latitude: { not: null, gt: 0 },
    };

    const rawOrders = await prisma.autoPickOrder.findMany({
      where,
      select: {
        id: true,
        orderNo: true,
        dailyPlatformSequence: true,
        platform: true,
        orderTime: true,
        userAddress: true,
        shopId: true,
        shopAddress: true,
        rawPayload: true,
        longitude: true,
        latitude: true,
        actualPaid: true,
        expectedIncome: true,
        status: true,
        distanceKm: true,
        delivery: true,
        items: {
          select: {
            productName: true,
            quantity: true,
            thumb: true,
            productNo: true,
          },
          take: 12,
        },
      },
      orderBy: { orderTime: "desc" },
      take: 3000,
    });

    const matchedOrders = rawOrders.filter(doesOrderMatchCurrentShop);
    const annotatedOrders = matchedOrders.map((ord) => ({
      ...ord,
      isBrush: readMainSystemSelfDeliveryFlag(ord.rawPayload),
    }));

    const totalRealOrders = annotatedOrders.filter((o) => !o.isBrush).length;
    const totalBrushOrders = annotatedOrders.filter((o) => o.isBrush).length;

    const orders = annotatedOrders.filter((ord) => {
      if (orderTypeFilter === "real") return !ord.isBrush;
      if (orderTypeFilter === "brush") return ord.isBrush;
      return true;
    });

    const platformStats: Record<string, { count: number; amount: number }> = {};
    let totalPaidCents = 0;
    let distanceSum = 0;
    let distanceCount = 0;

    let detectedShopAddress = currentShop.address || "";
    for (const ord of orders) {
      if (!detectedShopAddress && ord.shopAddress) {
        detectedShopAddress = ord.shopAddress;
      }
      const platformName = normalizeDisplayPlatform(ord.platform);
      if (!platformStats[platformName]) {
        platformStats[platformName] = { count: 0, amount: 0 };
      }
      platformStats[platformName].count += 1;
      platformStats[platformName].amount += (ord.actualPaid || 0);
      totalPaidCents += (ord.actualPaid || 0);

      if (typeof ord.distanceKm === "number" && ord.distanceKm > 0) {
        distanceSum += ord.distanceKm;
        distanceCount += 1;
      }
    }

    const avgDistanceKm = distanceCount > 0 ? Number((distanceSum / distanceCount).toFixed(2)) : 0;

    // 尝试在 Shop 表中查找该门店是否有保存的真实经纬度
    const dbShopMatch = await prisma.shop.findFirst({
      where: {
        userId: targetUserId,
        OR: [
          { id: currentShop.id },
          { name: currentShop.name },
        ],
      },
      select: {
        longitude: true,
        latitude: true,
      },
    });

    return NextResponse.json({
      currentShop: {
        id: currentShop.id,
        name: currentShop.name,
        address: detectedShopAddress,
        longitude: dbShopMatch?.longitude || null,
        latitude: dbShopMatch?.latitude || null,
      },
      availableShops: availableShops.map((s) => ({
        id: s.id,
        name: s.name,
        address: s.address,
        orderCount: s.orderCount,
        locatedOrderCount: s.locatedOrderCount,
        longitude: s.longitude,
        latitude: s.latitude,
      })),
      orders: orders.map((o) => ({
        id: o.id,
        orderNo: o.orderNo,
        seq: o.dailyPlatformSequence,
        platform: normalizeDisplayPlatform(o.platform),
        orderTime: o.orderTime,
        userAddress: o.userAddress,
        lng: o.longitude,
        lat: o.latitude,
        actualPaid: o.actualPaid,
        status: o.status,
        distanceKm: o.distanceKm,
        isBrush: o.isBrush,
        items: o.items.map((it) => ({
          name: it.productName,
          quantity: it.quantity,
          thumb: it.thumb || null,
          productNo: it.productNo || null,
        })),
      })),
      summary: {
        totalOrders: orders.length,
        totalPaid: totalPaidCents,
        avgDistanceKm,
        platformStats,
        totalRealOrders,
        totalBrushOrders,
        orderType: orderTypeFilter,
      },
    });
  } catch (error) {
    console.error("Failed to fetch order distribution data:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "获取订单分布数据失败",
    }, { status: 500 });
  }
}
