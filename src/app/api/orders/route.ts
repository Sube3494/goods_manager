import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { parseAsShanghaiTime } from "@/lib/dateUtils";
import { Prisma } from "../../../../prisma/generated-client";

export const dynamic = "force-dynamic";

function toBooleanFilter(value: string | null) {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") || 20)));
    const query = String(searchParams.get("query") || "").trim();
    const platform = String(searchParams.get("platform") || "").trim();
    const status = String(searchParams.get("status") || "").trim();
    const startDate = String(searchParams.get("startDate") || "").trim();
    const endDate = String(searchParams.get("endDate") || "").trim();
    const hasDelivery = toBooleanFilter(searchParams.get("hasDelivery"));

    const where: Prisma.AutoPickOrderWhereInput = {
      userId: session.id,
      ...(platform ? { platform } : {}),
      ...(status ? { status } : {}),
      ...(startDate || endDate ? {
        orderTime: {
          ...(startDate ? { gte: parseAsShanghaiTime(startDate) } : {}),
          ...(endDate ? { lte: parseAsShanghaiTime(`${endDate} 23:59:59`) } : {}),
        },
      } : {}),
      ...(query ? {
        OR: [
          { orderNo: { contains: query, mode: "insensitive" as const } },
          { userAddress: { contains: query, mode: "insensitive" as const } },
          { platform: { contains: query, mode: "insensitive" as const } },
          { sourceId: { contains: query, mode: "insensitive" as const } },
          {
            items: {
              some: {
                OR: [
                  { productName: { contains: query, mode: "insensitive" as const } },
                  { productNo: { contains: query, mode: "insensitive" as const } },
                ],
              },
            },
          },
        ],
      } : {}),
      ...(hasDelivery === true ? { delivery: { not: Prisma.AnyNull } } : {}),
      ...(hasDelivery === false ? { delivery: { equals: Prisma.DbNull } } : {}),
    };

    const [orders, total, platformRows, statusRows] = await Promise.all([
      prisma.autoPickOrder.findMany({
        where,
        include: {
          items: {
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: [
          { orderTime: "desc" },
          { createdAt: "desc" },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.autoPickOrder.count({ where }),
      prisma.autoPickOrder.findMany({
        where: { userId: session.id },
        distinct: ["platform"],
        select: { platform: true },
        orderBy: { platform: "asc" },
      }),
      prisma.autoPickOrder.findMany({
        where: { userId: session.id, NOT: { status: null } },
        distinct: ["status"],
        select: { status: true },
        orderBy: { status: "asc" },
      }),
    ]);

    const summary = orders.reduce((acc, order) => {
      acc.actualPaid += order.actualPaid;
      acc.platformCommission += order.platformCommission;
      acc.itemCount += order.items.reduce((sum: number, item) => sum + item.quantity, 0);
      if (order.delivery) {
        acc.deliveryCount += 1;
      }
      return acc;
    }, {
      actualPaid: 0,
      platformCommission: 0,
      itemCount: 0,
      deliveryCount: 0,
    });

    return NextResponse.json({
      items: orders,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      filters: {
        platforms: platformRows.map((item) => item.platform).filter(Boolean),
        statuses: statusRows.map((item) => item.status).filter((item): item is string => Boolean(item)),
      },
      summary,
    });
  } catch (error) {
    console.error("Failed to fetch auto-pick orders:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to fetch orders",
    }, { status: 500 });
  }
}
