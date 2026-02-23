import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession() as SessionUser | null;
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "supplier:read")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { id } = await params;
    const supplier = await prisma.supplier.findUnique({
      where: { id }
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
    const session = await getSession() as SessionUser | null;
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "supplier:manage")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const supplier = await prisma.supplier.update({
      where: { id },
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
    const session = await getSession() as SessionUser | null;
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "supplier:manage")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { id: idParam } = await params;
    
    const ids = idParam.split(",");

    // 使用事务确保“先解绑，后删除”的原子性
    await prisma.$transaction(async (tx) => {
      // 1. 解绑商品 (将关联商品的 supplierId 置为 null)
      await tx.product.updateMany({
        where: { supplierId: { in: ids } },
        data: { supplierId: null }
      });

      // 2. 解绑采购项 (将关联采购单项的 supplierId 置为 null)
      await tx.purchaseOrderItem.updateMany({
        where: { supplierId: { in: ids } },
        data: { supplierId: null }
      });

      // 3. 执行删除
      await tx.supplier.deleteMany({
        where: { id: { in: ids } }
      });
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Bulk delete suppliers failed:", error);
    return NextResponse.json({ error: "无法删除：请检查相关数据引用是否过深（如已被外部系统快照等）。" }, { status: 500 });
  }

}
