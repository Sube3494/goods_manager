import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { hasAdminAccess, hasPermission } from "@/lib/permissions";
import { parseAsShanghaiTime } from "@/lib/dateUtils";
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

    // 1. 获取商户所有配置的有效店铺列表
    const userShops = await prisma.shop.findMany({
      where: { userId: targetUserId },
      select: {
        id: true,
        name: true,
        address: true,
        longitude: true,
        latitude: true,
      },
      orderBy: { name: "asc" },
    });

    const requestedShopName = String(searchParams.get("shop") || "").trim();
    const platformFilter = String(searchParams.get("platform") || "").trim();
    const startDate = String(searchParams.get("startDate") || "").trim();
    const endDate = String(searchParams.get("endDate") || "").trim();

    // 决定当前焦点的单家店铺（按用户需求：分布必须单店查看，不能混看）
    let currentShop = userShops.find((s) => s.name === requestedShopName) || userShops[0] || null;

    // 如果还没有在 Shop 表创建店铺，则尝试从历史订单的 shopId 或 shopAddress 解析
    if (!currentShop && requestedShopName) {
      currentShop = {
        id: "",
        name: requestedShopName,
        address: "",
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

    // 2. 构造针对该特定店铺的过滤条件
    const shopClauses: Prisma.AutoPickOrderWhereInput[] = [
      { rawPayload: { path: ["systemMeta", "resolvedShop", "name"], equals: currentShop.name } },
    ];
    if (currentShop.id) {
      shopClauses.unshift({ shopId: currentShop.id });
      shopClauses.push({ rawPayload: { path: ["systemMeta", "resolvedShop", "id"], equals: currentShop.id } });
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
      OR: shopClauses,
      ...(platformClause ? platformClause : {}),
      ...(startDate || endDate ? {
        orderTime: {
          ...(startDate ? { gte: parseAsShanghaiTime(startDate) } : {}),
          ...(endDate ? { lte: parseAsShanghaiTime(`${endDate} 23:59:59`) } : {}),
        },
      } : {}),
      // 过滤掉已删除的废单
      NOT: [
        { status: { contains: "删除", mode: "insensitive" } },
        { status: { equals: "delete", mode: "insensitive" } },
        { status: { equals: "deleted", mode: "insensitive" } },
      ],
      // 必须包含有效经纬度才能在地图上分布展现
      longitude: { not: null, gt: 0 },
      latitude: { not: null, gt: 0 },
    };

    // 3. 查询轻量级订单点集（上限 3000 单，足够覆盖单店数月的点位分布）
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

    // 4. 统计汇总计算
    const platformStats: Record<string, { count: number; amount: number }> = {};
    let totalPaidCents = 0;
    let distanceSum = 0;
    let distanceCount = 0;

    // 尝试在订单中提取门店地址或坐标（若当前 Shop 表无坐标）
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
      availableShops: userShops.map((s) => ({
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
