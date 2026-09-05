import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { hasAdminAccess, hasPermission } from "@/lib/permissions";
import { parseAsShanghaiTime } from "@/lib/dateUtils";
import { isAddressDisabled, getAddressDetail } from "@/lib/addressBook";
import { Prisma } from "@prisma/client";

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

    // 1. 读取用户【个人资料】那边的收货地址库（必须以个人资料里的收货地址门店为主，不是调货管理）
    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        shippingAddresses: true,
        permissions: true,
      },
    });

    const rawAddresses = Array.isArray(user?.shippingAddresses) ? (user.shippingAddresses as any[]) : [];
    
    // 查询调货库以尝试获取对应的经纬度或库关联
    const dbShops = await prisma.shop.findMany({
      where: { userId: targetUserId },
      select: { id: true, name: true, addressBookId: true, longitude: true, latitude: true },
    });

    const personalShops = rawAddresses
      .filter((item: any) => !isAddressDisabled(item))
      .map((item: any, index: number) => {
        const addressBookId = String(item?.id || `shipping-${index}`);
        const name = String(item?.label || "").trim();
        const address = getAddressDetail(item);
        const matchedDbShop = dbShops.find((s) => s.addressBookId === addressBookId || s.name === name);

        return {
          id: matchedDbShop?.id || addressBookId,
          addressBookId,
          name: name || `门店${index + 1}`,
          address,
          isDefault: Boolean(item?.isDefault),
          longitude: matchedDbShop?.longitude || (typeof item?.longitude === "number" ? item.longitude : null),
          latitude: matchedDbShop?.latitude || (typeof item?.latitude === "number" ? item.latitude : null),
        };
      })
      .filter((s) => s.name);

    // 兜底：若个人资料完全未录入地址，再回退到调货门店
    let availableShops = personalShops;
    if (availableShops.length === 0) {
      availableShops = dbShops.map((s) => ({
        id: s.id,
        addressBookId: s.id,
        name: s.name,
        address: "",
        isDefault: false,
        longitude: s.longitude,
        latitude: s.latitude,
      }));
    }

    const requestedShopName = String(searchParams.get("shop") || "").trim();
    const platformFilter = String(searchParams.get("platform") || "").trim();
    const startDate = String(searchParams.get("startDate") || "").trim();
    const endDate = String(searchParams.get("endDate") || "").trim();

    // 确定当前查看的单家店铺（按用户指示：必须一家一家店看）
    let currentShop = availableShops.find((s) => s.name === requestedShopName) || availableShops[0] || null;

    if (!currentShop && requestedShopName) {
      currentShop = {
        id: requestedShopName,
        addressBookId: requestedShopName,
        name: requestedShopName,
        address: "",
        isDefault: false,
        longitude: null,
        latitude: null,
      };
    }

    if (!currentShop) {
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

    // 2. 提取麦芽田映射关系（将第三方外卖平台门店与个人资料本地门店映射）
    const permissions = (user?.permissions && typeof user.permissions === "object") ? (user.permissions as any) : {};
    const integrationConfig = permissions.autoPickIntegration || {};
    const mappings: Array<any> = Array.isArray(integrationConfig.maiyatianShopMappings) ? integrationConfig.maiyatianShopMappings : [];

    // 找出所有映射到当前个人资料门店的第三方门店 ID 与名称
    const mappedMytShopIds: string[] = [];
    const mappedMytShopNames: string[] = [];
    for (const m of mappings) {
      const localName = String(m.localShopName || "").trim();
      const localId = String(m.localShopId || "").trim();
      if (localName === currentShop.name || (currentShop.id && localId === currentShop.id)) {
        if (m.maiyatianShopId) mappedMytShopIds.push(String(m.maiyatianShopId).trim());
        if (m.maiyatianShopName) mappedMytShopNames.push(String(m.maiyatianShopName).trim());
      }
    }

    // 3. 构建当前门店的订单匹配条件
    const shopConditions: Prisma.AutoPickOrderWhereInput[] = [
      { rawPayload: { path: ["systemMeta", "resolvedShop", "name"], equals: currentShop.name } },
    ];

    if (currentShop.id) {
      shopConditions.push({ rawPayload: { path: ["systemMeta", "resolvedShop", "id"], equals: currentShop.id } });
      shopConditions.push({ shopId: currentShop.id });
    }

    for (const mytId of mappedMytShopIds) {
      shopConditions.push({ shopId: mytId });
      shopConditions.push({ rawPayload: { path: ["shop_id"], equals: mytId } });
    }

    // 如果个人资料里只有这一家门店，或者有明确地址片段
    if (availableShops.length === 1) {
      // 只有一家店时，容错所有未指定冲突店铺的订单
      shopConditions.push({ id: { not: "" } });
    } else if (currentShop.address) {
      // 匹配门店地址片段
      const cleanAddr = currentShop.address.replace(/\s+/g, "");
      if (cleanAddr.length >= 6) {
        const searchKeywords = cleanAddr.slice(0, 15);
        shopConditions.push({ shopAddress: { contains: searchKeywords, mode: "insensitive" } });
      }
    }

    // 平台过滤
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
      OR: shopConditions,
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

    const orders = await prisma.autoPickOrder.findMany({
      where,
      select: {
        id: true,
        orderNo: true,
        dailyPlatformSequence: true,
        platform: true,
        orderTime: true,
        userAddress: true,
        shopAddress: true,
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
