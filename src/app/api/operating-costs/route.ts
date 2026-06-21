import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import {
  getDailyFixedOperatingCost,
  getDailyUtilityCost,
  normalizeMonthKey,
  normalizeOperatingCostShopName,
} from "@/lib/operatingCosts";
import {
  getStoredOperatingCostBill,
  getStoredOperatingCostProfile,
  listStoredOperatingCostBills,
} from "@/lib/operatingCostsStore";

function getOperatingCostProfileClient() {
  return (prisma as unknown as Record<string, any>).operatingCostProfile;
}

function getMonthlyBillClient() {
  return (prisma as unknown as Record<string, any>).operatingCostMonthlyBill;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthorizedUser("operating-costs:manage");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const monthKey = normalizeMonthKey(request.nextUrl.searchParams.get("month") || new Date());
    const shopName = normalizeOperatingCostShopName(request.nextUrl.searchParams.get("shopName"));
    if (!shopName) {
      return NextResponse.json({ error: "Missing shop name" }, { status: 400 });
    }
    const operatingCostProfileClient = getOperatingCostProfileClient();
    const operatingCostMonthlyBillClient = getMonthlyBillClient();
    if (!operatingCostProfileClient || !operatingCostMonthlyBillClient) {
      const [profile, selectedMonthBill, recentBills] = await Promise.all([
        getStoredOperatingCostProfile(user.id, shopName),
        getStoredOperatingCostBill(user.id, shopName, monthKey),
        listStoredOperatingCostBills(user.id, shopName, 6),
      ]);

      return NextResponse.json({
        profile: profile || {
          shopName,
          monthlyRent: 0,
          monthlyLabor: 0,
          allocationBaseDays: 30,
        },
        selectedMonthBill: selectedMonthBill || {
          shopName,
          monthKey,
          waterAmount: 0,
          electricAmount: 0,
          sharedElectricAmount: 0,
          propertyFeeAmount: 0,
        },
        recentBills,
        summary: {
          dailyFixedCost: getDailyFixedOperatingCost(profile),
          dailyUtilityCost: getDailyUtilityCost(selectedMonthBill || {
            shopName,
            monthKey,
            waterAmount: 0,
            electricAmount: 0,
            sharedElectricAmount: 0,
            propertyFeeAmount: 0,
          }),
        },
      });
    }

    const [profile, selectedMonthBill, recentBills] = await Promise.all([
      operatingCostProfileClient.findUnique({
        where: {
          userId_shopName: {
            userId: user.id,
            shopName,
          },
        },
      }),
      operatingCostMonthlyBillClient.findUnique({
        where: {
          userId_shopName_monthKey: {
            userId: user.id,
            shopName,
            monthKey,
          },
        },
      }),
      operatingCostMonthlyBillClient.findMany({
        where: { userId: user.id, shopName },
        orderBy: { monthKey: "desc" },
        take: 6,
      }),
    ]);

    return NextResponse.json({
      profile: profile || {
        shopName,
        monthlyRent: 0,
        monthlyLabor: 0,
        allocationBaseDays: 30,
      },
      selectedMonthBill: selectedMonthBill || {
        shopName,
        monthKey,
        waterAmount: 0,
        electricAmount: 0,
        sharedElectricAmount: 0,
        propertyFeeAmount: 0,
      },
      recentBills,
      summary: {
        dailyFixedCost: getDailyFixedOperatingCost(profile),
        dailyUtilityCost: getDailyUtilityCost(selectedMonthBill || {
          shopName,
          monthKey,
          waterAmount: 0,
          electricAmount: 0,
          sharedElectricAmount: 0,
          propertyFeeAmount: 0,
        }),
      },
    });
  } catch (error) {
    console.error("Failed to fetch operating costs:", error);
    return NextResponse.json({ error: "Failed to fetch operating costs" }, { status: 500 });
  }
}
