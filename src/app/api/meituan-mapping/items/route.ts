import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthorizedUser("product:read");
    if (!user) {
      return NextResponse.json({ error: "未授权或权限不足" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get("batchId");
    const status = searchParams.get("status"); // ALL, UNMATCHED, SUGGESTED, BOUND, IGNORED
    const search = (searchParams.get("search") || "").trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(10, parseInt(searchParams.get("pageSize") || "50", 10)));

    const where: any = {
      userId: user.id,
    };

    if (batchId && batchId !== "ALL") {
      where.batchId = batchId;
    }

    if (status && status !== "ALL") {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { meituanSkuId: { contains: search, mode: "insensitive" } },
        { barcode: { contains: search, mode: "insensitive" } },
      ];
    }

    const [total, items, stats] = await Promise.all([
      prisma.meituanImportItem.count({ where }),
      prisma.meituanImportItem.findMany({
        where,
        include: {
          suggestedProduct: {
            select: {
              id: true,
              name: true,
              sku: true,
              image: true,
              costPrice: true,
            },
          },
          bindProduct: {
            select: {
              id: true,
              name: true,
              sku: true,
              image: true,
              costPrice: true,
            },
          },
        },
        orderBy: [
          { status: "asc" }, // SUGGESTED / UNMATCHED 在前，BOUND 在后
          { createdAt: "asc" },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      // 当前 batchId 下的统计
      prisma.meituanImportItem.groupBy({
        by: ["status"],
        where: batchId && batchId !== "ALL" ? { batchId, userId: user.id } : { userId: user.id },
        _count: { _all: true },
      }),
    ]);

    const statusCounts: Record<string, number> = {
      TOTAL: 0,
      UNMATCHED: 0,
      SUGGESTED: 0,
      BOUND: 0,
      IGNORED: 0,
    };

    for (const stat of stats) {
      statusCounts[stat.status] = stat._count._all;
      statusCounts.TOTAL += stat._count._all;
    }

    return NextResponse.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      statusCounts,
    });
  } catch (error: any) {
    console.error("获取美团待配对明细失败:", error);
    return NextResponse.json({ error: "获取待配对明细失败" }, { status: 500 });
  }
}
