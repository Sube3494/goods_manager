import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { formatLocalDate } from "@/lib/dateUtils";

type DailyAggregate = {
  dateKey: string;
  label: string;
  payment: number;
  received: number;
  commission: number;
  expense: number;
  count: number;
};

type DailyShopAggregate = DailyAggregate & {
  shopName: string;
};

export async function GET() {
  const session = await getAuthorizedUser("brush:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const [brushProductCount, plans, orders] = await Promise.all([
      prisma.brushProduct.count({
        where: { userId: session.id },
      }),
      prisma.brushOrderPlan.findMany({
        where: { userId: session.id },
        select: {
          date: true,
          shopName: true,
          items: {
            select: {
              quantity: true,
            },
          },
        },
      }),
      prisma.brushOrder.findMany({
        where: { userId: session.id },
        orderBy: { date: "desc" },
        select: {
          date: true,
          shopName: true,
          paymentAmount: true,
          receivedAmount: true,
          commission: true,
        },
      }),
    ]);

    const today = formatLocalDate(new Date());
    let todayPlanItemCount = 0;
    const todayShops = new Set<string>();

    plans.forEach((plan) => {
      const itemCount = plan.items.reduce((sum, item) => sum + (item.quantity || 1), 0);
      if (formatLocalDate(plan.date) === today) {
        todayPlanItemCount += itemCount;
        const shopName = plan.shopName?.trim();
        if (shopName) todayShops.add(shopName);
      }
    });

    const dailyMap = new Map<string, DailyAggregate>();
    const dailyShopMap = new Map<string, DailyShopAggregate>();
    let totalPayment = 0;
    let totalReceived = 0;
    let totalCommission = 0;
    let totalExpense = 0;
    let todayOrderCount = 0;
    let todayPayment = 0;
    let todayReceived = 0;
    let todayCommission = 0;
    let todayExpense = 0;

    orders.forEach((order) => {
      const dateKey = formatLocalDate(order.date);
      const label = dateKey;
      const shopName = order.shopName?.trim() || "未分店铺";
      const expense = (order.paymentAmount - order.receivedAmount) + order.commission;

      totalPayment += order.paymentAmount;
      totalReceived += order.receivedAmount;
      totalCommission += order.commission;
      totalExpense += expense;

      if (dateKey === today) {
        todayOrderCount += 1;
        todayPayment += order.paymentAmount;
        todayReceived += order.receivedAmount;
        todayCommission += order.commission;
        todayExpense += expense;
      }

      const dailyCurrent = dailyMap.get(dateKey) || {
        dateKey,
        label,
        payment: 0,
        received: 0,
        commission: 0,
        expense: 0,
        count: 0,
      };
      dailyCurrent.payment += order.paymentAmount;
      dailyCurrent.received += order.receivedAmount;
      dailyCurrent.commission += order.commission;
      dailyCurrent.expense += expense;
      dailyCurrent.count += 1;
      dailyMap.set(dateKey, dailyCurrent);

      const shopMapKey = `${dateKey}__${shopName}`;
      const dailyShopCurrent = dailyShopMap.get(shopMapKey) || {
        dateKey,
        label,
        shopName,
        payment: 0,
        received: 0,
        commission: 0,
        expense: 0,
        count: 0,
      };
      dailyShopCurrent.payment += order.paymentAmount;
      dailyShopCurrent.received += order.receivedAmount;
      dailyShopCurrent.commission += order.commission;
      dailyShopCurrent.expense += expense;
      dailyShopCurrent.count += 1;
      dailyShopMap.set(shopMapKey, dailyShopCurrent);
    });

    return NextResponse.json({
      stats: {
        brushProductCount,
        todayPlanItemCount,
        todayShopCount: todayShops.size,
        averageItemsPerShop: todayShops.size > 0 ? todayPlanItemCount / todayShops.size : 0,
        todayOrderCount,
        todayPayment,
        todayReceived,
        todayCommission,
        todayExpense,
        orderCount: orders.length,
        payment: totalPayment,
        received: totalReceived,
        commission: totalCommission,
        expense: totalExpense,
      },
      shops: Array.from(
        new Set(
          orders.map((order) => order.shopName?.trim()).filter((shopName): shopName is string => Boolean(shopName))
        )
      ).sort((a, b) => a.localeCompare(b, "zh-CN")),
      orderDaily: Array.from(dailyMap.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey)),
      orderDailyByShop: Array.from(dailyShopMap.values()).sort((a, b) => {
        if (a.dateKey === b.dateKey) return a.shopName.localeCompare(b.shopName, "zh-CN");
        return a.dateKey.localeCompare(b.dateKey);
      }),
    });
  } catch (error) {
    console.error("Failed to build brush dashboard:", error);
    return NextResponse.json({ error: "Failed to build brush dashboard" }, { status: 500 });
  }
}
