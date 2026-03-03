import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { randomUUID } from "crypto";

// POST /api/analytics/track
// 记录一次页面访问，无需登录权限
export async function POST(req: NextRequest) {
  try {
    const path = req.headers.get("referer")?.replace(/^https?:\/\/[^/]+/, "") || "/";

    // 读取或生成匿名访客 ID
    const existingId = req.cookies.get("visitor_id")?.value;
    const visitorId = existingId || randomUUID();

    // 判断今天是否是该访客的首次访问（UTC 日期）
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setUTCHours(23, 59, 59, 999);

    let isUnique = false;
    if (!existingId) {
      // 全新访客，直接标记为 unique
      isUnique = true;
    } else {
      // 检查今天是否已有该访客的 unique 记录
      const existingUnique = await prisma.pageView.findFirst({
        where: {
          visitorId,
          isUnique: true,
          date: { gte: todayStart, lte: todayEnd },
        },
        select: { id: true },
      });
      isUnique = !existingUnique;
    }

    await prisma.pageView.create({
      data: { path, visitorId, isUnique },
    });

    const response = NextResponse.json({ ok: true });

    // 若是新访客，设置 cookie（1年有效期）
    if (!existingId) {
      response.cookies.set("visitor_id", visitorId, {
        maxAge: 60 * 60 * 24 * 365,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
    }

    return response;
  } catch (error) {
    // 静默失败，不影响用户体验
    console.error("[Analytics] track error:", error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
