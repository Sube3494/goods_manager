import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthorizedUser } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAuthorizedUser("settlement:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const settlement = await prisma.settlement.findUnique({
      where: { id, userId: session.id },
      include: {
        items: true,
      },
    });

    if (!settlement) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    return NextResponse.json(settlement);
  } catch (error) {
    console.error('Error fetching settlement detail:', error);
    return NextResponse.json({ error: 'Failed to fetch settlement detail' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAuthorizedUser("settlement:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { id } = await params;

  try {
    // Use deleteMany to allow filtering by both id AND userId for security
    const result = await prisma.settlement.deleteMany({
      where: { id, userId: session.id },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: 'Record not found or unauthorized' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Record deleted successfully' });
  } catch (error) {
    console.error('Error deleting settlement:', error);
    return NextResponse.json({ error: 'Failed to delete settlement' }, { status: 500 });
  }
}
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAuthorizedUser("settlement:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { date, note, items, serviceFeeRate, totalNet, totalServiceFee, totalAlreadyReceived, finalBalance, shopName } = body;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Verify ownership and existence
      const existing = await tx.settlement.findUnique({
        where: { id, userId: session.id },
      });

      if (!existing) {
        throw new Error("Record not found or unauthorized");
      }

      // 2. Delete existing items
      await tx.settlementItem.deleteMany({
        where: { settlementId: id },
      });

      // 3. Update main settlement record
      const updated = await tx.settlement.update({
        where: { id },
        data: {
          date: new Date(date),
          note,
          shopName,
          serviceFeeRate,
          totalNet,
          serviceFee: totalServiceFee,
          totalAlreadyReceived,
          finalBalance,
          items: {
            create: items.map((item: any) => ({
              shopName: item.shopName,
              platformName: item.platformName,
              serviceFeeRate: item.serviceFeeRate,
              received: item.received,
              brushing: item.brushing,
              receivedToCard: item.receivedToCard,
              net: item.net,
            })),
          },
        },
        include: {
          items: true,
        },
      });

      return updated;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating settlement:', error);
    return NextResponse.json({ error: (error as Error).message || 'Failed to update settlement' }, { status: 500 });
  }
}
