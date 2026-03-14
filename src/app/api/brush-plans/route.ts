import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthorizedUser } from "@/lib/auth";
import { getStorageStrategy } from '@/lib/storage';

interface BrushPlanItemInput {
  productId?: string | null;
  productName?: string | null;
  quantity?: number | string;
  searchKeyword?: string | null;
  note?: string | null;
  done?: boolean;
  sortOrder?: number;
}

export async function GET(req: NextRequest) {
  const session = await getAuthorizedUser("brush_plan:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const searchParams = req.nextUrl.searchParams;
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 1000);
  const skip = (page - 1) * limit;

  try {
    const [plans, total] = await Promise.all([
      prisma.brushOrderPlan.findMany({
        where: { userId: session.id },
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          items: {
            include: {
              product: true,
            },
            orderBy: { sortOrder: 'asc' }
          },
        },
      }),
      prisma.brushOrderPlan.count({
        where: { userId: session.id }
      }),
    ]);

    const storage = await getStorageStrategy();
    const resolvedPlans = plans.map(plan => ({
      ...plan,
      items: plan.items.map(item => ({
        ...item,
        product: item.product ? {
          ...item.product,
          image: item.product.image ? storage.resolveUrl(item.product.image) : null
        } : null
      }))
    }));

    return NextResponse.json({
      data: resolvedPlans,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching brush plans:', error);
    return NextResponse.json(
      { error: 'Failed to fetch brush plans' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthorizedUser("brush_plan:manage");
    if (!session) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const body = await req.json();
    const {
      date,
      title,
      items,
      note,
      status,
    } = body;

    const plan = await prisma.brushOrderPlan.create({
      data: {
        date: new Date(date),
        title: title || null,
        note: note || null,
        status: status || 'Draft',
        userId: session.id,
        items: {
          create: (items as BrushPlanItemInput[]).map((item, index) => ({
            productId: item.productId || null,
            productName: item.productName || null,
            quantity: parseInt(String(item.quantity || 1)),
            searchKeyword: item.searchKeyword || null,
            note: item.note || null,
            done: item.done || false,
            sortOrder: item.sortOrder || index,
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
    const resolvedPlan = {
      ...plan,
      items: plan.items.map(item => ({
        ...item,
        product: item.product ? {
          ...item.product,
          image: item.product.image ? storage.resolveUrl(item.product.image) : null
        } : null
      }))
    };

    return NextResponse.json(resolvedPlan, { status: 201 });
  } catch (error) {
    console.error('Error creating brush plan:', error);
    return NextResponse.json(
      { error: `Failed to create brush plan: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
