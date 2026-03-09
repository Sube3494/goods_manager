import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthorizedUser } from "@/lib/auth";
import { getStorageStrategy } from '@/lib/storage';

export async function GET(req: NextRequest) {
  const session = await getAuthorizedUser("brush:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  const searchParams = req.nextUrl.searchParams;
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 1000);
  const skip = (page - 1) * limit;

  try {
    const [orders, total] = await Promise.all([
      prisma.brushOrder.findMany({
        where: { userId: session.id },
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
        where: { userId: session.id }
      }),
    ]);

    const storage = await getStorageStrategy();
    const resolvedOrders = orders.map(order => ({
      ...order,
      items: order.items.map(item => ({
        ...item,
        product: item.product ? {
          ...item.product,
          image: item.product.image ? storage.resolveUrl(item.product.image) : null
        } : null
      }))
    }));

    return NextResponse.json({
      data: resolvedOrders,
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
    const session = await getAuthorizedUser("brush:manage");
    if (!session) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const body = await req.json();
    const {
      date,
      type,
      items,
      paymentAmount,
      receivedAmount,
      commission,
      note,
      status,
      platformOrderId,
    } = body;

    // 去重检查
    if (platformOrderId) {
      const existing = await prisma.brushOrder.findFirst({
        where: {
          userId: session.id,
          platformOrderId: platformOrderId,
        }
      });
      if (existing) {
        return NextResponse.json({ 
          error: "该订单已存在（重复导入）", 
          code: "DUPLICATE_ORDER",
          orderId: existing.id 
        }, { status: 409 });
      }
    }

    const order = await prisma.brushOrder.create({
      data: {
        date: new Date(date),
        type,
        userId: session.id,
        paymentAmount: parseFloat(paymentAmount || 0),
        receivedAmount: parseFloat(receivedAmount || 0),
        commission: parseFloat(commission || 0),
        note: note || null,
        status: status || 'Draft',
        platformOrderId: platformOrderId || null,
        items: {
          create: items.map((item: { productId: string; quantity: number }) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        },
      },
      include: {
        items: {
          include: {
            product: true
          }
        },
      },
    });

    const storage = await getStorageStrategy();
    const resolvedOrder = {
      ...order,
      items: order.items.map(item => ({
        ...item,
        product: item.product ? {
          ...item.product,
          image: item.product.image ? storage.resolveUrl(item.product.image) : null
        } : null
      }))
    };

    return NextResponse.json(resolvedOrder, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating brush order:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to create brush order: ${errorMessage}` },
      { status: 500 }
    );
  }
}
