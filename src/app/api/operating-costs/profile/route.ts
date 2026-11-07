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
    const rentStartDate = body.rentStartDate === "" ? null : body.rentStartDate;
    if (rentStartDate != null) {
      const validFormat = typeof rentStartDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rentStartDate);
      const date = validFormat ? new Date(`${rentStartDate}T00:00:00Z`) : null;
      if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== rentStartDate) {
        return NextResponse.json({ error: "始租日期无效" }, { status: 400 });
      }
    }

    const profileData = { shopName, monthlyRent, rentStartDate, monthlyLabor, allocationBaseDays: 30 };
    const operatingCostProfileClient = getOperatingCostProfileClient();
    if (!operatingCostProfileClient) {
      const profile = await saveStoredOperatingCostProfile({
        userId: user.id,
        ...profileData,
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
      update: profileData,
      create: {
        userId: user.id,
        ...profileData,
      },
    });

    return NextResponse.json(profile);
  } catch (error) {
    console.error("Failed to save operating cost profile:", error);
    return NextResponse.json({ error: "Failed to save operating cost profile" }, { status: 500 });
  }
}
