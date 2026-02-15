import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const session = await getFreshSession() as SessionUser | null;
  const searchParams = req.nextUrl.searchParams;
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');
  const skip = (page - 1) * limit;

  if (!session || !session.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session, "brush:read")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const [orders, total] = await Promise.all([
      prisma.brushOrder.findMany({
        where: { workspaceId: session.workspaceId },
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      }),
      prisma.brushOrder.count({
        where: { workspaceId: session.workspaceId }
      }),
    ]);

    return NextResponse.json({
      data: orders,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching brush orders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch brush orders' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "brush:create")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const body = await req.json();
    const {
      date,
      type,
      items,
      principalAmount,
      paymentAmount,
      receivedAmount,
      commission,
      note,
      status,
    } = body;

    const order = await prisma.brushOrder.create({
      data: {
        date: new Date(date),
        type,
        workspaceId: session.workspaceId,
        principalAmount: parseFloat(principalAmount || 0),
        paymentAmount: parseFloat(paymentAmount || 0),
        receivedAmount: parseFloat(receivedAmount || 0),
        commission: parseFloat(commission || 0),
        note: note || null,
        status: status || 'Draft',
        items: {
          create: items.map((item: { productId: string; quantity: number }) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating brush order:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to create brush order: ${errorMessage}` },
      { status: 500 }
    );
  }
}
