import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { randomUUID, createHash } from "crypto";

// 从请求中提取真实 IP，兼容各类代理/CDN Header
function getClientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for 可能包含多个 IP，取第一个（最原始客户端）
    const ip = forwarded.split(",")[0].trim();
    if (ip) return ip;
  }
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") || // Cloudflare
    null
  );
}

// 对 IP 做单向 hash，隐私保护，不存明文
function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

// POST /api/analytics/track
// 记录一次页面访问，无需登录权限
export async function POST(req: NextRequest) {
  try {
    const path = req.headers.get("referer")?.replace(/^https?:\/\/[^/]+/, "") || "/";

    // 读取或生成匿名访客 ID
    const existingId = req.cookies.get("visitor_id")?.value;
    const visitorId = existingId || randomUUID();

    // 获取并 hash IP
    const rawIp = getClientIp(req);
    const ipHash = rawIp ? hashIp(rawIp) : null;

    // 判断今天是否是该访客的首次访问（UTC 日期）
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setUTCHours(23, 59, 59, 999);

    let isUnique = false;

    if (!existingId) {
      // 全新 Cookie 访客，但还需检查 IP 是否今天已有 unique 记录
      if (ipHash) {
        const existingByIp = await prisma.pageView.findFirst({
          where: {
            ip: ipHash,
            isUnique: true,
            date: { gte: todayStart, lte: todayEnd },
          },
          select: { id: true },
        });
        // IP 今天未出现过才标记 unique，防止清 Cookie 后重复计数
        isUnique = !existingByIp;
      } else {
        isUnique = true;
      }
    } else {
      // 已有 Cookie，先检查 Cookie 去重
      const existingByCookie = await prisma.pageView.findFirst({
        where: {
          visitorId,
          isUnique: true,
          date: { gte: todayStart, lte: todayEnd },
        },
        select: { id: true },
      });

      if (existingByCookie) {
        // Cookie 已标记过 unique，今天不再重复
        isUnique = false;
      } else if (ipHash) {
        // Cookie 是今天第一次，但同 IP 可能已从别的 Cookie 访问过
        const existingByIp = await prisma.pageView.findFirst({
          where: {
            ip: ipHash,
            isUnique: true,
            date: { gte: todayStart, lte: todayEnd },
          },
          select: { id: true },
        });
        isUnique = !existingByIp;
      } else {
        isUnique = true;
      }
    }

    await prisma.pageView.create({
      data: { path, visitorId, ip: ipHash, isUnique },
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
