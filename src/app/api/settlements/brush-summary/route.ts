import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { FinanceMath } from "@/lib/math";
import { getDisplayedMetrics, normalizeBrushSettlementPlatform } from "@/lib/brushDisplay";

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
    const [orders, profile] = await Promise.all([
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
        select: { brushCommissionBoostEnabled: true },
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
