import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";

// GET /api/analytics/stats?range=7d|30d|12m
// 需要管理员登录
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthorizedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const range = req.nextUrl.searchParams.get("range") || "7d";

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // 本月起始
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // 查询今日 PV / UV
    const [todayPV, todayUV, monthPV, monthUV, totalPV, totalUV] =
      await Promise.all([
        prisma.pageView.count({
          where: { date: { gte: todayStart, lte: todayEnd } },
        }),
        prisma.pageView.count({
          where: { date: { gte: todayStart, lte: todayEnd }, isUnique: true },
        }),
        prisma.pageView.count({
          where: { date: { gte: monthStart } },
        }),
        prisma.pageView.count({
          where: { date: { gte: monthStart }, isUnique: true },
        }),
        prisma.pageView.count(),
        prisma.pageView.count({ where: { isUnique: true } }),
      ]);

    // 根据 range 生成趋势数据
    type TrendPoint = { label: string; pv: number; uv: number };
    let trend: TrendPoint[] = [];

    if (range === "7d" || range === "30d") {
      const days = range === "7d" ? 7 : 30;
      const points: TrendPoint[] = [];

      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
        const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);

        const [pv, uv] = await Promise.all([
          prisma.pageView.count({ where: { date: { gte: start, lte: end } } }),
          prisma.pageView.count({ where: { date: { gte: start, lte: end }, isUnique: true } }),
        ]);

        // 标签：7d 显示 M/D，30d 也显示 M/D
        const label = `${d.getMonth() + 1}/${d.getDate()}`;
        points.push({ label, pv, uv });
      }
      trend = points;
    } else if (range === "12m") {
      const points: TrendPoint[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const start = new Date(d.getFullYear(), d.getMonth(), 1);
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);

        const [pv, uv] = await Promise.all([
          prisma.pageView.count({ where: { date: { gte: start, lte: end } } }),
          prisma.pageView.count({ where: { date: { gte: start, lte: end }, isUnique: true } }),
        ]);

        const label = `${d.getMonth() + 1}月`;
        points.push({ label, pv, uv });
      }
      trend = points;
    }

    return NextResponse.json({
      today: { pv: todayPV, uv: todayUV },
      month: { pv: monthPV, uv: monthUV },
      total: { pv: totalPV, uv: totalUV },
      trend,
    });
  } catch (error) {
    console.error("[Analytics] stats error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
