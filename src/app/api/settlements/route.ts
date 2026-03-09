import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthorizedUser } from "@/lib/auth";

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
      items
    } = body;

    const settlement = await prisma.settlement.create({
      data: {
        userId: session.id,
        date: new Date(date || Date.now()),
        totalNet: parseFloat(totalNet || 0),
        serviceFeeRate: parseFloat(serviceFeeRate || 0.06),
        serviceFee: parseFloat(serviceFee || 0),
        totalAlreadyReceived: parseFloat(totalAlreadyReceived || 0),
        finalBalance: parseFloat(finalBalance || 0),
        note: note || null,
        items: {
          create: items.map((item: any) => ({
            platformName: item.name,
            received: parseFloat(item.received || 0),
            brushing: parseFloat(item.brushing || 0),
            receivedToCard: parseFloat(item.receivedToCard || 0),
            net: parseFloat(item.net || 0)
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
