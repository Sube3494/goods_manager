import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { normalizeMonthKey, normalizeOperatingCostShopName } from "@/lib/operatingCosts";
import { saveStoredOperatingCostBill } from "@/lib/operatingCostsStore";

function getMonthlyBillClient() {
  return (prisma as unknown as Record<string, any>).operatingCostMonthlyBill;
}

export async function POST(request: Request) {
  try {
    const user = await getAuthorizedUser("operating-costs:manage");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const shopName = normalizeOperatingCostShopName(body?.shopName);
    const monthKey = normalizeMonthKey(body?.monthKey || new Date());
    const waterAmount = Math.max(0, Number(body?.waterAmount) || 0);
    const electricAmount = Math.max(0, Number(body?.electricAmount) || 0);
    const sharedElectricAmount = Math.max(0, Number(body?.sharedElectricAmount) || 0);
    const propertyFeeAmount = Math.max(0, Number(body?.propertyFeeAmount) || 0);
    if (!shopName) {
      return NextResponse.json({ error: "Missing shop name" }, { status: 400 });
    }
    const operatingCostMonthlyBillClient = getMonthlyBillClient();
    if (!operatingCostMonthlyBillClient) {
      const bill = await saveStoredOperatingCostBill({
        userId: user.id,
        shopName,
        monthKey,
        waterAmount,
        electricAmount,
        sharedElectricAmount,
        propertyFeeAmount,
      });
      return NextResponse.json(bill);
    }

    const bill = await operatingCostMonthlyBillClient.upsert({
      where: {
        userId_shopName_monthKey: {
          userId: user.id,
          shopName,
          monthKey,
        },
      },
      update: {
        shopName,
        waterAmount,
        electricAmount,
        sharedElectricAmount,
        propertyFeeAmount,
      },
      create: {
        userId: user.id,
        shopName,
        monthKey,
        waterAmount,
        electricAmount,
        sharedElectricAmount,
        propertyFeeAmount,
      },
    });

    return NextResponse.json(bill);
  } catch (error) {
    console.error("Failed to save monthly operating bill:", error);
    return NextResponse.json({ error: "Failed to save monthly operating bill" }, { status: 500 });
  }
}
