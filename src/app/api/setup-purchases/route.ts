import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthorizedUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const batches = await prisma.storeOpeningBatch.findMany({
      where: { userId: session.id },
      orderBy: { date: 'desc' },
      include: {
        _count: { select: { items: true } }
      }
    });

    return NextResponse.json(batches);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch batches" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthorizedUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    if (!hasPermission(session as SessionUser, "setup_purchase:manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { name, date } = await req.json();
    if (!name) return NextResponse.json({ error: "名称为必填项" }, { status: 400 });

    const batch = await prisma.storeOpeningBatch.create({
      data: {
        name,
        date: date ? new Date(date) : new Date(),
        userId: session.id
      }
    });

    return NextResponse.json(batch, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create batch" }, { status: 500 });
  }
}
