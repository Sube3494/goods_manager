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

    // 1. 读取用户【个人资料】那边的收货地址库（100% 严格来自个人中心地址库，绝不取调货管理门店 Shop 表兜底）
    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        shippingAddresses: true,
        permissions: true,
      },
    });

    const rawAddresses = Array.isArray(user?.shippingAddresses) ? (user.shippingAddresses as any[]) : [];

    const personalShops = rawAddresses
      .filter((item: any) => !isAddressDisabled(item))
      .map((item: any, index: number) => {
        const addressBookId = String(item?.id || `shipping-${index}`);
        const name = String(item?.label || "").trim();
        const address = getAddressDetail(item);

        return {
          id: addressBookId,
          addressBookId,
          name: name || `门店${index + 1}`,
          address,
          isDefault: Boolean(item?.isDefault),
          longitude: typeof item?.longitude === "number" ? item.longitude : null,
          latitude: typeof item?.latitude === "number" ? item.latitude : null,
        };
      })
      .filter((s) => s.name);

    // 严禁调货门店回退！个人资料收货地址库是唯一且排他的数据来源
    const availableShops = personalShops;

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
    const startDate = String(searchParams.get("startDate") || "").trim();
    const endDate = String(searchParams.get("endDate") || "").trim();

    // 确定当前查看的单家店铺（按用户指示：必须一家一家店看）
    let currentShop = availableShops.find((s) => s.name === requestedShopName)
      || availableShops.find((s) => normalizeShopNameKey(s.name) === normalizeShopNameKey(requestedShopName))
      || availableShops[0];

    // 2. 提取麦芽田映射关系（将第三方外卖平台门店与个人资料本地门店映射）
    const permissions = (user?.permissions && typeof user.permissions === "object") ? (user.permissions as any) : {};
    const integrationConfig = normalizeAutoPickIntegrationConfig(permissions.autoPickIntegration);
    const mappings = integrationConfig.maiyatianShopMappings || [];

    // 找出所有映射到当前个人资料门店的第三方门店 ID 与名称
    const mappedMytShopIds: string[] = [];
    const mappedMytShopNames: string[] = [];
    for (const m of mappings) {
      const localName = String(m.localShopName || "").trim();
      if (
        localName === currentShop.name ||
        normalizeShopNameKey(localName) === normalizeShopNameKey(currentShop.name)
      ) {
        if (m.maiyatianShopId) mappedMytShopIds.push(String(m.maiyatianShopId).trim());
        if (m.maiyatianShopName) mappedMytShopNames.push(String(m.maiyatianShopName).trim());
      }
    }

    // 3. 构建当前门店的订单匹配逻辑与复合条件
    const isSingleShopUser = availableShops.length === 1;

    const doesOrderMatchCurrentShop = (order: {
      shopId?: string | null;
      shopAddress?: string | null;
      rawPayload?: unknown;
    }) => {
      // 0. 如果用户个人资料只有 1 家门店，全量订单均归属该门店
      if (isSingleShopUser) return true;

      // 1. 系统标记的 resolvedShop
      const payloadObj = (order.rawPayload && typeof order.rawPayload === "object") ? (order.rawPayload as any) : null;
      const resolvedShop = payloadObj?.systemMeta?.resolvedShop;
      if (resolvedShop) {
        if (resolvedShop.name && (resolvedShop.name === currentShop.name || normalizeShopNameKey(resolvedShop.name) === normalizeShopNameKey(currentShop.name))) {
          return true;
        }
        if (resolvedShop.id && (resolvedShop.id === currentShop.id || resolvedShop.id === currentShop.addressBookId)) {
          return true;
        }
      }

      // 2. 麦芽田第三方门店 ID 匹配
      const orderShopId = normalizeExternalId(order.shopId || readShopIdFromRawPayload(order.rawPayload));
      if (orderShopId && mappedMytShopIds.some((id) => normalizeExternalId(id) === orderShopId)) {
        return true;
      }

      // 3. 第三方原始店名模糊/包含匹配
      const orderShopName = readShopNameFromRawPayload(order.rawPayload);
      if (orderShopName) {
        const normOrderShopName = normalizeShopNameKey(orderShopName);
        const normCurrentName = normalizeShopNameKey(currentShop.name);
        const simpOrderName = normalizeShopNameKey(simplifyShopName(orderShopName));
        
        if (normOrderShopName === normCurrentName || simpOrderName === normCurrentName) {
          return true;
        }
        if (normOrderShopName.includes(normCurrentName) || normCurrentName.includes(normOrderShopName)) {
          return true;
        }
        if (mappedMytShopNames.some((mName) => {
          const normMName = normalizeShopNameKey(mName);
          return normOrderShopName === normMName || normOrderShopName.includes(normMName);
        })) {
          return true;
        }
      }

      // 4. 门店地址模糊路段匹配（>= 6 个字符）
      if (currentShop.address) {
        const orderShopAddress = String(order.shopAddress || readShopAddressFromRawPayload(order.rawPayload) || "").trim();
        const cleanShopAddr = currentShop.address.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "");
        const cleanOrderAddr = orderShopAddress.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "");
        if (cleanShopAddr.length >= 6 && cleanOrderAddr.length >= 6) {
          const keySegment = cleanShopAddr.slice(0, 10);
          if (cleanOrderAddr.includes(keySegment)) {
            return true;
          }
        }
      }

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
          },
          take: 6,
        },
      },
      orderBy: { orderTime: "desc" },
      take: 3000,
    });

    const orders = rawOrders.filter(doesOrderMatchCurrentShop);

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

    return NextResponse.json({
      currentShop: {
        id: currentShop.id,
        name: currentShop.name,
        address: detectedShopAddress,
        longitude: currentShop.longitude,
        latitude: currentShop.latitude,
      },
      availableShops: availableShops.map((s) => ({
        id: s.id,
        name: s.name,
        address: s.address,
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
        items: o.items.map((it) => ({
          name: it.productName,
          quantity: it.quantity,
        })),
      })),
      summary: {
        totalOrders: orders.length,
        totalPaid: totalPaidCents,
        avgDistanceKm,
        platformStats,
      },
    });
  } catch (error) {
    console.error("Failed to fetch order distribution data:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "获取订单分布数据失败",
    }, { status: 500 });
  }
}
