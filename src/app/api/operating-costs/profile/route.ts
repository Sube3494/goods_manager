import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { normalizeOperatingCostShopName } from "@/lib/operatingCosts";
import { saveStoredOperatingCostProfile } from "@/lib/operatingCostsStore";

function getOperatingCostProfileClient() {
  return (prisma as unknown as Record<string, any>).operatingCostProfile;
}

export async function POST(request: Request) {
  try {
    const user = await getAuthorizedUser("operating-costs:manage");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const shopName = normalizeOperatingCostShopName(body?.shopName);
    const monthlyRent = Math.max(0, Number(body?.monthlyRent) || 0);
    const monthlyLabor = Math.max(0, Number(body?.monthlyLabor) || 0);
    if (!shopName) {
      return NextResponse.json({ error: "Missing shop name" }, { status: 400 });
    }
    const operatingCostProfileClient = getOperatingCostProfileClient();
    if (!operatingCostProfileClient) {
      const profile = await saveStoredOperatingCostProfile({
        userId: user.id,
        shopName,
        monthlyRent,
        monthlyLabor,
        allocationBaseDays: 30,
      });
      return NextResponse.json(profile);
    }

    const profile = await operatingCostProfileClient.upsert({
      where: {
        userId_shopName: {
          userId: user.id,
          shopName,
        },
      },
      update: {
        shopName,
        monthlyRent,
        monthlyLabor,
        allocationBaseDays: 30,
      },
      create: {
        userId: user.id,
        shopName,
        monthlyRent,
        monthlyLabor,
        allocationBaseDays: 30,
      },
    });

    return NextResponse.json(profile);
  } catch (error) {
    console.error("Failed to save operating cost profile:", error);
    return NextResponse.json({ error: "Failed to save operating cost profile" }, { status: 500 });
  }
}
