import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthorizedUser } from "@/lib/auth";
import { FinanceMath } from "@/lib/math";

export async function GET(req: NextRequest) {
  const session = await getAuthorizedUser("settlement:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const searchParams = req.nextUrl.searchParams;
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100);
  const skip = (page - 1) * limit;

  try {
    const [settlements, total] = await Promise.all([
      prisma.settlement.findMany({
        where: { userId: session.id },
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          items: true
        }
      }),
      prisma.settlement.count({
        where: { userId: session.id }
      })
    ]);

    return NextResponse.json({
      data: settlements,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    });
  } catch (error) {
    console.error('Error fetching settlements:', error);
    return NextResponse.json({ error: 'Failed to fetch settlements' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getAuthorizedUser("settlement:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      date,
      totalNet,
      serviceFeeRate,
      serviceFee,
      totalAlreadyReceived,
      finalBalance,
      note,
      shopName,
      items
    } = body;

    const settlement = await prisma.settlement.create({
      data: {
        userId: session.id,
        date: new Date(date || Date.now()),
        // 使用 FinanceMath.add(..., 0) 可以安全地将任何输入转化为保留2位小数的安全浮点数
        totalNet: FinanceMath.add(parseFloat(totalNet || 0), 0),
        serviceFeeRate: parseFloat(serviceFeeRate || 0.06), // 费率不强求两位小数
        serviceFee: FinanceMath.add(parseFloat(serviceFee || 0), 0),
        totalAlreadyReceived: FinanceMath.add(parseFloat(totalAlreadyReceived || 0), 0),
        finalBalance: FinanceMath.add(parseFloat(finalBalance || 0), 0),
        note: note || null,
        shopName: shopName || null,
        items: {
          create: items.map((item: {
            platformName: string;
            shopName: string;
            serviceFeeRate: number;
            received: number;
            brushing: number;
            receivedToCard: number;
            net: number;
          }) => ({
            platformName: item.platformName,
            shopName: item.shopName,
            serviceFeeRate: item.serviceFeeRate,
            received: FinanceMath.add(item.received || 0, 0),
            brushing: FinanceMath.add(item.brushing || 0, 0),
            receivedToCard: FinanceMath.add(item.receivedToCard || 0, 0),
            net: FinanceMath.add(item.net || 0, 0)
          }))
        }
      },
      include: {
        items: true
      }
    });

    return NextResponse.json(settlement, { status: 201 });
  } catch (error) {
    console.error('Error creating settlement:', error);
    return NextResponse.json({ error: 'Failed to create settlement' }, { status: 500 });
  }
}
