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

  const { id } = params;

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

  const { id } = params;

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
