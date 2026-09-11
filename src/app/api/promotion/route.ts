import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { hasAdminAccess } from "@/lib/permissions";

function startOfDay(input: Date) {
  const date = new Date(input);
  date.setHours(0, 0, 0, 0);
  return date;
}

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

    const dateStr = request.nextUrl.searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const targetDate = startOfDay(new Date(dateStr));

    const records = await prisma.dailyPromotionExpense.findMany({
      where: {
        userId: targetUserId,
        date: targetDate,
      },
    });

    let amountMeituan = 0;
    let amountJingdong = 0;
    let amountTaobao = 0;
    let amount = 0;

    records.forEach((record) => {
      amountMeituan += record.amountMeituan ?? 0;
      amountJingdong += record.amountJingdong ?? 0;
      amountTaobao += record.amountTaobao ?? 0;
      amount += record.amount ?? 0;
    });

    const amountOther = Math.max(0, amount - amountMeituan - amountJingdong - amountTaobao);

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
        amountOther: Math.max(0, r.amount - r.amountMeituan - r.amountJingdong - r.amountTaobao),
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
    const { date, shopName, amountMeituan, amountJingdong, amountTaobao, amountOther, userId: requestedUserId } = body;

    const cleanRequestedUserId = requestedUserId ? String(requestedUserId).trim() : "";
    if (cleanRequestedUserId && cleanRequestedUserId !== user.id) {
      return NextResponse.json({ error: "不允许修改其他成员的推广费数据" }, { status: 403 });
    }
    const targetUserId = user.id;

    if (!date) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const finalShopName = String(shopName || "").trim();
    const meituan = Math.max(0, Number(amountMeituan) || 0);
    const jingdong = Math.max(0, Number(amountJingdong) || 0);
    const taobao = Math.max(0, Number(amountTaobao) || 0);
    const other = Math.max(0, Number(amountOther) || 0);
    const total = meituan + jingdong + taobao + other;

    const targetDate = startOfDay(new Date(date));

    const record = await prisma.dailyPromotionExpense.upsert({
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
    });

    return NextResponse.json({
      success: true,
      shopName: record.shopName,
      amount: record.amount,
      amountMeituan: record.amountMeituan,
      amountJingdong: record.amountJingdong,
      amountTaobao: record.amountTaobao,
      amountOther: Math.max(0, record.amount - record.amountMeituan - record.amountJingdong - record.amountTaobao),
    });
  } catch (error) {
    console.error("[Promotion API POST Error]:", error);
    return NextResponse.json({ error: "Failed to save promotion expense" }, { status: 500 });
  }
}
