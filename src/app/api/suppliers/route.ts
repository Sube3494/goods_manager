import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const suppliers = await prisma.supplier.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { products: true }
        }
      }
    });

    return NextResponse.json(suppliers);
  } catch {
    return NextResponse.json({ error: "Failed to fetch suppliers" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Auto-generate code if not provided
    if (!body.code) {
      const lastSupplier = await prisma.supplier.findFirst({
        where: { code: { startsWith: 'SUP-' } },
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
      data: body
    });
    return NextResponse.json(supplier);
  } catch (error) {
    console.error("Failed to create supplier:", error);
    return NextResponse.json({ error: "Failed to create supplier" }, { status: 500 });
  }
}
