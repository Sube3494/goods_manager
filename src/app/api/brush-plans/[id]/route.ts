import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthorizedUser } from "@/lib/auth";
import { getStorageStrategy } from '@/lib/storage';

interface BrushPlanItemInput {
  productId?: string | null;
  productName?: string | null;
  quantity?: number | string;
  searchKeyword?: string | null;
  platform?: string | null;
  note?: string | null;
  done?: boolean;
  sortOrder?: number;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedUser("brush:manage");
    if (!session) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { id } = await params;
    const plan = await prisma.brushOrderPlan.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: true,
          },
          orderBy: { sortOrder: 'asc' }
        },
      },
    });

    if (!plan) {
      return NextResponse.json(
        { error: 'Brush plan not found' },
        { status: 404 }
      );
    }

    // Check ownership
    if (plan.userId !== session.id) {
       return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

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

    return NextResponse.json(resolvedPlan);
  } catch (error) {
    console.error('Error fetching brush plan:', error);
    return NextResponse.json(
      { error: `Failed to fetch brush plan: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedUser("brush:manage");
    if (!session) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { id } = await params;
    
    // Check ownership first
    const existing = await prisma.brushOrderPlan.findUnique({
        where: { id },
        select: { userId: true }
    });
    if (!existing || existing.userId !== session.id) {
        return NextResponse.json({ error: "Plan not found or permission denied" }, { status: 403 });
    }

    const body = await req.json();
    const {
      date,
      title,
      shopName,
      items,
      note,
      status,
    } = body;

    const plan = await prisma.$transaction(async (tx) => {
      // If items are provided, replace them all
      if (items && Array.isArray(items)) {
        await tx.brushOrderPlanItem.deleteMany({
          where: { planId: id },
        });

        return tx.brushOrderPlan.update({
          where: { id },
          data: {
            date: date ? new Date(date) : undefined,
            title: title !== undefined ? title : undefined,
            shopName: shopName !== undefined ? shopName : undefined,
            note: note !== undefined ? note : undefined,
            status: status || undefined,
            items: {
              create: (items as BrushPlanItemInput[]).map((item, index) => ({
                productId: item.productId || null,
                productName: item.productName || null,
                quantity: parseInt(String(item.quantity || 1)),
                searchKeyword: item.searchKeyword || null,
                platform: item.platform || null,
                note: item.note || null,
                done: item.done || false,
                sortOrder: item.sortOrder !== undefined ? item.sortOrder : index,
              })),
            },
          },
          include: {
            items: {
              include: {
                product: true
              },
              orderBy: { sortOrder: 'asc' }
            },
          },
        });
      } else {
        // Just update plan metadata
        return tx.brushOrderPlan.update({
          where: { id },
          data: {
            date: date ? new Date(date) : undefined,
            title: title !== undefined ? title : undefined,
            shopName: shopName !== undefined ? shopName : undefined,
            note: note !== undefined ? note : undefined,
            status: status || undefined,
          },
          include: {
            items: {
              include: {
                product: true
              },
              orderBy: { sortOrder: 'asc' }
            },
          },
        });
      }
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

    return NextResponse.json(resolvedPlan);
  } catch (error) {
    console.error('Error updating brush plan:', error);
    return NextResponse.json(
      { error: `Failed to update brush plan: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedUser("brush:manage");
    if (!session) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { id } = await params;
    
    // Check ownership
    const existing = await prisma.brushOrderPlan.findUnique({
        where: { id },
        select: { userId: true }
    });
    if (!existing || existing.userId !== session.id) {
        return NextResponse.json({ error: "Plan not found or permission denied" }, { status: 403 });
    }

    await prisma.brushOrderPlan.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting brush plan:', error);
    return NextResponse.json(
      { error: `Failed to delete brush plan: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
