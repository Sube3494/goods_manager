import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const order = await prisma.brushOrder.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json(
        { error: 'Brush order not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(order);
  } catch (error: any) {
    console.error('Error fetching brush order:', error);
    return NextResponse.json(
      { error: `Failed to fetch brush order: ${error.message}` },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    // Delete existing items and create new ones (simple approach)
    // Transaction makes sure it's atomic
    const order = await prisma.$transaction(async (tx) => {
      await tx.brushOrderItem.deleteMany({
        where: { brushOrderId: id },
      });

      return tx.brushOrder.update({
        where: { id },
        data: {
          date: new Date(date),
          type,
          principalAmount: parseFloat(principalAmount || 0),
          paymentAmount: parseFloat(paymentAmount || 0),
          receivedAmount: parseFloat(receivedAmount || 0),
          commission: parseFloat(commission || 0),
          note: note || null,
          status: status || 'Draft',
          items: {
            create: items.map((item: any) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
          },
        },
        include: {
          items: true,
        },
      });
    });

    return NextResponse.json(order);
  } catch (error: any) {
    console.error('Error updating brush order:', error);
    return NextResponse.json(
      { error: `Failed to update brush order: ${error.message}` },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.brushOrder.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting brush order:', error);
    return NextResponse.json(
      { error: `Failed to delete brush order: ${error.message}` },
      { status: 500 }
    );
  }
}
