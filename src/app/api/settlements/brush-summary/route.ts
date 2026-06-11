import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { FinanceMath } from "@/lib/math";
import { getDisplayedMetrics, normalizeBrushSettlementPlatform } from "@/lib/brushDisplay";
import { resolveAutoPickMatchedShopName } from "@/lib/autoPickOrders";
import { isAutoPickOrderCancelledStatus, isAutoPickOrderDeletedStatus } from "@/lib/autoPickOrderStatus";

function readDeliveryFee(delivery: unknown) {
  if (!delivery || typeof delivery !== "object" || Array.isArray(delivery)) {
    return 0;
  }
  const value = Number((delivery as Record<string, unknown>).sendFee || 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function resolveMonthRange(month: string) {
  const normalized = String(month || "").trim();
  if (!/^\d{4}-\d{2}$/.test(normalized)) {
    return null;
  }

  const [yearText, monthText] = normalized.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return null;
  }

  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0));
  return { start, end };
}

function isAddressMatch(addr1: string | null | undefined, addr2: string | null | undefined): boolean {
  if (!addr1 || !addr2) return false;
  const a1 = addr1.toLowerCase();
  const a2 = addr2.toLowerCase();
  if (a1.includes("香港路") && a2.includes("香港路")) return true;
  if ((a1.includes("棠景街") || a1.includes("祥岗东街")) && (a2.includes("棠景街") || a2.includes("祥岗东街"))) return true;
  if (a1.includes("华远东路") && a2.includes("华远东路")) return true;
  return false;
}

function isNameAliasMatch(shopName: string, label: string): boolean {
  const s = shopName.trim().toLowerCase();
  const l = label.trim().toLowerCase();
  if (s === l || l.includes(s) || s.includes(l)) return true;
  
  // 别名对齐映射关系
  if (s === "遵义店" && l === "baiyun") return true;
  if (s === "zunyi" && l === "zunyi") return true;
  if (s === "4593" && l.includes("4593")) return true;
  if (s === "2533" && l.includes("2533")) return true;
  
  return false;
}

function findShippingAddressLabel(
  order: { shopId: string | null; rawPayload: unknown },
  systemShops: Array<{ id: string; name: string; addressBookId: string | null; address: string | null }>,
  userAddresses: Array<{ id: string; label?: string | null; address?: string | null }>,
  permissions: unknown
): string | null {
  // 1. 如果有 shopId，优先通过 shopId 关联系统店铺
  if (order.shopId) {
    const shop = systemShops.find(s => s.id === order.shopId);
    if (shop) {
      // 1.1 优先通过已有的 addressBookId 直接匹配
      if (shop.addressBookId) {
        const addr = userAddresses.find(a => a.id === shop.addressBookId);
        if (addr?.label) {
          return addr.label.trim();
        }
      }
      
      // 1.2 通过名字和别名匹配
      const addrByName = userAddresses.find(a => isNameAliasMatch(shop.name, a.label || ""));
      if (addrByName?.label) {
        return addrByName.label.trim();
      }

      // 1.3 通过地址内容模糊匹配
      if (shop.address) {
        const matchedAddrs = userAddresses.filter(a => isAddressMatch(shop.address, a.address));
        if (matchedAddrs.length === 1) {
          return (matchedAddrs[0].label || "").trim() || null;
        } else if (matchedAddrs.length > 1) {
          const best = matchedAddrs.find(a => isNameAliasMatch(shop.name, a.label || ""));
          if (best?.label) return best.label.trim();
          return (matchedAddrs[0].label || "").trim() || null;
        }
      }
    }
  }

  // 2. 如果没有关联上，通过 resolveAutoPickMatchedShopName 得到的 shopName 兜底来找
  const resolvedShopName = resolveAutoPickMatchedShopName(
    { shopId: order.shopId, rawPayload: order.rawPayload },
    permissions
  );
  if (!resolvedShopName) return null;

  const matchedAddr = userAddresses.find(a => isNameAliasMatch(resolvedShopName, a.label || ""));
  if (matchedAddr?.label) {
    return matchedAddr.label.trim();
  }

  return resolvedShopName;
}

export async function GET(req: NextRequest) {
  const session = await getAuthorizedUser("settlement:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const month = req.nextUrl.searchParams.get("month") || "";
  const range = resolveMonthRange(month);
  if (!range) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  try {
    const canUseBrushSimulation = hasPermission(session, "brush:simulate");
    const [orders, profile, systemShops] = await Promise.all([
      prisma.brushOrder.findMany({
        where: {
          userId: session.id,
          date: {
            gte: range.start,
            lt: range.end,
          },
        },
        select: {
          id: true,
          type: true,
          shopName: true,
          paymentAmount: true,
          receivedAmount: true,
          commission: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: session.id },
        select: { brushCommissionBoostEnabled: true, permissions: true, shippingAddresses: true },
      }),
      prisma.shop.findMany({
        where: { userId: session.id },
        select: { id: true, name: true, addressBookId: true, address: true },
      }),
    ]);

    const showSimulatedValues = canUseBrushSimulation && Boolean(profile?.brushCommissionBoostEnabled);
    const totals = new Map<string, number>();

    for (const order of orders) {
      const shopName = String(order.shopName || "").trim();
      if (!shopName) continue;

      const platformName = normalizeBrushSettlementPlatform(String(order.type || ""));
      if (!platformName) continue;

      const displayed = getDisplayedMetrics(order, { brushCommissionBoostEnabled: showSimulatedValues }, showSimulatedValues);
      const key = `${shopName}__${platformName}`;
      totals.set(key, FinanceMath.add(totals.get(key) || 0, displayed.received));
    }

    if (showSimulatedValues) {
      const autoPickOrders = await prisma.autoPickOrder.findMany({
        where: {
          userId: session.id,
          orderTime: {
            gte: range.start,
            lt: range.end,
          },
        },
        select: {
          platform: true,
          delivery: true,
          shopId: true,
          rawPayload: true,
          status: true,
        },
      });

      const userAddresses = (profile?.shippingAddresses as Array<{ id: string; label?: string | null; address?: string | null }>) || [];

      for (const order of autoPickOrders) {
        if (isAutoPickOrderCancelledStatus(order.status) || isAutoPickOrderDeletedStatus(order.status)) {
          continue;
        }

        const shopName = findShippingAddressLabel(
          { shopId: order.shopId, rawPayload: order.rawPayload },
          systemShops,
          userAddresses,
          profile?.permissions
        );
        if (!shopName) continue;

        // 所有平台的总配送费统一加到“美团闪购”的刷单到手金额中，避免京东和淘宝暴露
        const platformName = "美团闪购";

        // 订单的配送费以“分”为单位，需除以 100 转换成“元”再累加到以“元”为单位的刷单到手金额中
        const deliveryFee = readDeliveryFee(order.delivery) / 100;
        if (deliveryFee <= 0) continue;

        const key = `${shopName}__${platformName}`;
        totals.set(key, FinanceMath.add(totals.get(key) || 0, deliveryFee));
      }
    }

    return NextResponse.json({
      month,
      simulated: showSimulatedValues,
      data: Array.from(totals.entries()).map(([key, amount]) => {
        const [shopName, platformName] = key.split("__");
        return { shopName, platformName, amount };
      }),
    });
  } catch (error) {
    console.error("Error fetching settlement brush summary:", error);
    return NextResponse.json({ error: "Failed to fetch brush summary" }, { status: 500 });
  }
}
