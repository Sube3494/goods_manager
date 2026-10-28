import { mayReadMemberData } from "@/lib/memberDataVisibilityServer";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { hasAdminAccess } from "@/lib/permissions";
import { getEffectivePromotionExpenses } from "@/services/promotionService";
import { formatLocalDate, parseAsShanghaiTime } from "@/lib/dateUtils";
import { validPromotionDate, parsePromotionAmounts } from "@/lib/fixedPromotion";
import { FinanceMath } from "@/lib/math";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthorizedUser("order:manage");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requestedUserId = String(request.nextUrl.searchParams.get("userId") || "").trim();
    const canManageMembers = user.role === "SUPER_ADMIN"
      || hasAdminAccess(user, "members:orders")
      || hasAdminAccess(user, "members:manage")
      || hasAdminAccess(user, "members:status")
      || hasAdminAccess(user, "whitelist:manage")
      || hasAdminAccess(user, "roles:manage")
      || String(user.roleProfile?.name || "").includes("管理");
    const targetUserId = requestedUserId && canManageMembers ? requestedUserId : user.id;
    if (!await mayReadMemberData(user, targetUserId)) {
      return NextResponse.json({ error: "该成员数据已隐藏" }, { status: 403 });
    }

    const dateStr = request.nextUrl.searchParams.get("date") || formatLocalDate(new Date());
    if (!validPromotionDate(dateStr)) return NextResponse.json({ error: "日期无效" }, { status: 400 });
    const targetDate = parseAsShanghaiTime(dateStr);

    const records = await getEffectivePromotionExpenses(targetUserId, targetDate, parseAsShanghaiTime(`${dateStr} 23:59:59`), undefined, true);

    let amountMeituan = 0;
    let amountJingdong = 0;
    let amountTaobao = 0;
    let amount = 0;

    records.forEach((record) => {
      amountMeituan = FinanceMath.add(amountMeituan, record.amountMeituan ?? 0);
      amountJingdong = FinanceMath.add(amountJingdong, record.amountJingdong ?? 0);
      amountTaobao = FinanceMath.add(amountTaobao, record.amountTaobao ?? 0);
      amount = FinanceMath.add(amount, record.amount ?? 0);
    });

    const amountOther = Math.max(0, FinanceMath.sum(amount, -amountMeituan, -amountJingdong, -amountTaobao));

    return NextResponse.json({
      amount,
      amountMeituan,
      amountJingdong,
      amountTaobao,
      amountOther,
      items: records.map((r) => ({
        shopName: r.shopName,
        amountMeituan: r.amountMeituan,
        amountJingdong: r.amountJingdong,
        amountTaobao: r.amountTaobao,
        amountOther: Math.max(0, FinanceMath.sum(r.amount, -r.amountMeituan, -r.amountJingdong, -r.amountTaobao)),
        amount: r.amount,
      })),
    });
  } catch (error) {
    console.error("[Promotion API GET Error]:", error);
    return NextResponse.json({ error: "Failed to fetch promotion expense" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthorizedUser("order:manage");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    let itemsToProcess: Array<{
      date: string;
      shopName?: string;
      amountMeituan?: number;
      amountJingdong?: number;
      amountTaobao?: number;
      amountOther?: number;
      userId?: string;
    }> = [];

    if (Array.isArray(body)) {
      itemsToProcess = body;
    } else if (Array.isArray(body?.items)) {
      const { date, userId } = body;
      itemsToProcess = body.items.map((item: (typeof itemsToProcess)[number]) => ({
        ...item,
        date: item.date || date,
        userId: item.userId || userId,
      }));
    } else if (body && typeof body === "object") {
      itemsToProcess = [body];
    }

    if (itemsToProcess.length === 0) {
      return NextResponse.json({ error: "没有需要保存的数据" }, { status: 400 });
    }

    for (const item of itemsToProcess) {
      const cleanRequestedUserId = item.userId ? String(item.userId).trim() : "";
      if (cleanRequestedUserId && cleanRequestedUserId !== user.id && user.role !== "SUPER_ADMIN") {
        return NextResponse.json({ error: "不允许修改其他成员的推广费数据" }, { status: 403 });
      }
      if (!validPromotionDate(item.date)) {
        return NextResponse.json({ error: "Invalid date" }, { status: 400 });
      }
    }

    let normalizedItems;
    try {
      normalizedItems = itemsToProcess.map((item) => ({ ...item, ...parsePromotionAmounts(item as Record<string, unknown>) }));
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "推广费数据无效" }, { status: 400 });
    }
    const results = await prisma.$transaction(async (tx) => {
      const records = [];
      for (const item of normalizedItems) {
        const targetUserId = user.role === "SUPER_ADMIN" && item.userId ? String(item.userId).trim() || user.id : user.id;
        const targetDate = parseAsShanghaiTime(item.date);
        const finalShopName = String(item.shopName || "").trim();
        const meituan = Math.max(0, Number(item.amountMeituan) || 0);
        const jingdong = Math.max(0, Number(item.amountJingdong) || 0);
        const taobao = Math.max(0, Number(item.amountTaobao) || 0);
        const other = Math.max(0, Number(item.amountOther) || 0);
        const total = FinanceMath.sum(meituan, jingdong, taobao, other);
        const existing = await tx.dailyPromotionExpense.findFirst({
          where: { userId: targetUserId, shopName: finalShopName, date: { gte: targetDate, lte: parseAsShanghaiTime(`${item.date} 23:59:59`) } },
          orderBy: { updatedAt: "desc" },
          select: { id: true },
        });
        const data = { amount: total, amountMeituan: meituan, amountJingdong: jingdong, amountTaobao: taobao };
        if (existing) {
          records.push(await tx.dailyPromotionExpense.update({ where: { id: existing.id }, data }));
          continue;
        }

        records.push(await tx.dailyPromotionExpense.upsert({
          where: {
            userId_date_shopName: {
              userId: targetUserId,
              date: targetDate,
              shopName: finalShopName,
            },
          },
          update: {
            amount: total,
            amountMeituan: meituan,
            amountJingdong: jingdong,
            amountTaobao: taobao,
          },
          create: {
            userId: targetUserId,
            date: targetDate,
            shopName: finalShopName,
            amount: total,
            amountMeituan: meituan,
            amountJingdong: jingdong,
            amountTaobao: taobao,
          },
        }));
      }
      return records;
    });

    return NextResponse.json({
      success: true,
      count: results.length,
      items: results.map((record) => ({
        shopName: record.shopName,
        amount: record.amount,
        amountMeituan: record.amountMeituan,
        amountJingdong: record.amountJingdong,
        amountTaobao: record.amountTaobao,
        amountOther: Math.max(0, record.amount - record.amountMeituan - record.amountJingdong - record.amountTaobao),
      })),
    });
  } catch (error) {
    console.error("[Promotion API POST Error]:", error);
    return NextResponse.json({ error: "Failed to save promotion expense" }, { status: 500 });
  }
}
