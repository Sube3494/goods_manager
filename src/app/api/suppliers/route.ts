import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";

export async function GET() {
  const session = await getFreshSession() as SessionUser | null;
  const workspaceId = session?.workspaceId;

  if (!session || !workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!hasPermission(session, "supplier:read")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const suppliers = await prisma.supplier.findMany({
      where: {
        workspaceId
      },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { products: true }
        }
      }
    });

    return NextResponse.json(suppliers);
  } catch (error) {
    console.error("Failed to fetch suppliers:", error);
    return NextResponse.json({ error: "Failed to fetch suppliers" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    const workspaceId = session?.workspaceId;

    if (!session || !workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "supplier:manage")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const body = await request.json();
    
    // Auto-generate code if not provided
    if (!body.code) {
      const lastSupplier = await prisma.supplier.findFirst({
        where: { 
            workspaceId,
            code: { startsWith: 'SUP-' } 
        },
        orderBy: { code: 'desc' }
      });

      let nextNumber = 1;
      if (lastSupplier?.code) {
        const lastNumber = parseInt(lastSupplier.code.split('-')[1]);
        if (!isNaN(lastNumber)) {
          nextNumber = lastNumber + 1;
        }
      }
      body.code = `SUP-${String(nextNumber).padStart(3, '0')}`;
    }

    const supplier = await prisma.supplier.create({
      data: {
          ...body,
          workspaceId
      }
    });
    return NextResponse.json(supplier);
  } catch (error: unknown) {
    console.error("Failed to create supplier:", error);
    
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2002') {
        return NextResponse.json({ error: "供应商代码在该工作区已存在" }, { status: 400 });
    }

    return NextResponse.json({ error: "Failed to create supplier" }, { status: 500 });
  }
}
