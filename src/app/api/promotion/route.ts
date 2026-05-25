import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";

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

    const dateStr = request.nextUrl.searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const targetDate = startOfDay(new Date(dateStr));

    const record = await prisma.dailyPromotionExpense.findUnique({
      where: {
        userId_date: {
          userId: user.id,
          date: targetDate,
        },
      },
    });

    const amountMeituan = record?.amountMeituan ?? 0;
    const amountJingdong = record?.amountJingdong ?? 0;
    const amountTaobao = record?.amountTaobao ?? 0;
    const amount = record?.amount ?? (amountMeituan + amountJingdong + amountTaobao);

    return NextResponse.json({ amount, amountMeituan, amountJingdong, amountTaobao });
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
    const { date, amountMeituan, amountJingdong, amountTaobao } = body;

    if (!date) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const meituan = Math.max(0, Number(amountMeituan) || 0);
    const jingdong = Math.max(0, Number(amountJingdong) || 0);
    const taobao = Math.max(0, Number(amountTaobao) || 0);
    const total = meituan + jingdong + taobao;

    const targetDate = startOfDay(new Date(date));

    const record = await prisma.dailyPromotionExpense.upsert({
      where: {
        userId_date: {
          userId: user.id,
          date: targetDate,
        },
      },
      update: {
        amount: total,
        amountMeituan: meituan,
        amountJingdong: jingdong,
        amountTaobao: taobao,
      },
      create: {
        userId: user.id,
        date: targetDate,
        amount: total,
        amountMeituan: meituan,
        amountJingdong: jingdong,
        amountTaobao: taobao,
      },
    });

    return NextResponse.json({
      success: true,
      amount: record.amount,
      amountMeituan: record.amountMeituan,
      amountJingdong: record.amountJingdong,
      amountTaobao: record.amountTaobao,
    });
  } catch (error) {
    console.error("[Promotion API POST Error]:", error);
    return NextResponse.json({ error: "Failed to save promotion expense" }, { status: 500 });
  }
}
