import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedUser("supplier:manage");
    if (!session) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { id } = await params;
    const supplier = await prisma.supplier.findFirst({
      where: {
        id,
        userId: session.id,
      },
    });
    if (!supplier) {
      return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    }
    return NextResponse.json(supplier);
  } catch {
    return NextResponse.json({ error: "Failed to fetch supplier" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedUser("supplier:manage");
    if (!session) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const existingSupplier = await prisma.supplier.findFirst({
      where: {
        id,
        userId: session.id,
      },
      select: { id: true },
    });

    if (!existingSupplier) {
      return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    }

    const supplier = await prisma.supplier.update({
      where: { id: existingSupplier.id },
      data: body
    });
    return NextResponse.json(supplier);
  } catch {
    return NextResponse.json({ error: "Failed to update supplier" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedUser("supplier:manage");
    if (!session) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { id: idParam } = await params;
    const ids = idParam.split(",");
    const ownedSuppliers = await prisma.supplier.findMany({
      where: {
        id: { in: ids },
        userId: session.id,
      },
      select: { id: true },
    });
    const ownedIds = ownedSuppliers.map((item) => item.id);

    if (ownedIds.length === 0) {
      return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    }
    if (ownedIds.length !== ids.length) {
      return NextResponse.json({ error: "包含无权操作的供应商" }, { status: 403 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.product.updateMany({
        where: {
          supplierId: { in: ownedIds },
          userId: session.id,
        },
        data: { supplierId: null }
      });

      await tx.purchaseOrderItem.updateMany({
        where: {
          supplierId: { in: ownedIds },
          purchaseOrder: {
            userId: session.id,
          },
        },
        data: { supplierId: null }
      });

      await tx.supplier.deleteMany({
        where: {
          id: { in: ownedIds },
          userId: session.id,
        }
      });
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Bulk delete suppliers failed:", error);
    return NextResponse.json({ error: "无法删除：请检查相关数据引用是否过深（如已被外部系统快照等）。" }, { status: 500 });
  }

}
