import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getStorageStrategy } from '@/lib/storage';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Fetch public plan data - no auth required
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

    // Check expiration - 12 hours from updatedAt
    const EXPIRATION_MS = 12 * 60 * 60 * 1000;
    const now = new Date();
    const updatedAt = new Date(plan.updatedAt);
    
    if (now.getTime() - updatedAt.getTime() > EXPIRATION_MS) {
      return NextResponse.json(
        { error: 'Share link has expired (12h limit)' },
        { status: 410 }
      );
    }

    const storage = await getStorageStrategy();
    const resolvedPlan = {
      id: plan.id,
      date: plan.date,
      title: plan.title,
      note: plan.note,
      status: plan.status,
      items: plan.items.map(item => ({
        id: item.id,
        quantity: item.quantity,
        searchKeyword: item.searchKeyword,
        note: item.note,
        done: item.done,
        product: item.product ? {
          name: item.product.name,
          image: item.product.image ? storage.resolveUrl(item.product.image) : null
        } : null
      }))
    };

    return NextResponse.json(resolvedPlan);
  } catch (error) {
    console.error('Error fetching public brush plan:', error);
    return NextResponse.json(
      { error: 'Failed to fetch plan' },
      { status: 500 }
    );
  }
}
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { itemId, done } = body;

    if (!itemId) {
      return NextResponse.json({ error: 'Item ID is required' }, { status: 400 });
    }

    // 1. Fetch current plan to check expiration
    const plan = await prisma.brushOrderPlan.findUnique({
      where: { id },
      include: { items: true }
    });

    if (!plan) {
      return NextResponse.json({ error: 'Brush plan not found' }, { status: 404 });
    }

    // 2. Check expiration (12h limit)
    const EXPIRATION_MS = 12 * 60 * 60 * 1000;
    const updatedAt = new Date(plan.updatedAt);
    if (new Date().getTime() - updatedAt.getTime() > EXPIRATION_MS) {
      return NextResponse.json(
        { error: 'Link expired, cannot update' },
        { status: 410 }
      );
    }

    // 3. Update the specific item
    // Note: We also check the itemId belongs to the plan for security
    const updatedItem = await prisma.brushOrderPlanItem.updateMany({
      where: {
        id: itemId,
        planId: id
      },
      data: {
        done: !!done
      }
    });

    if (updatedItem.count === 0) {
      return NextResponse.json({ error: 'Item not found in this plan' }, { status: 404 });
    }

    return NextResponse.json({ success: true, done: !!done });
  } catch (error) {
    console.error('Error updating public brush plan item:', error);
    return NextResponse.json(
      { error: 'Failed to update item' },
      { status: 500 }
    );
  }
}
