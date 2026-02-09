import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
    const { id: idParam } = await params;
    
    // 支持逗号分隔的批量 ID
    const ids = idParam.split(",");

    // 检查是否有任何供应商下仍有商品
    const productCount = await prisma.product.count({
      where: {
        supplierId: { in: ids }
      }
    });

    if (productCount > 0) {
      return NextResponse.json(
        { error: "无法删除：选中的某些供应商仍有关联商品。" },
        { status: 400 }
      );
    }

    await prisma.supplier.deleteMany({
      where: {
        id: { in: ids }
      }
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Bulk delete suppliers failed:", error);
    return NextResponse.json({ error: "无法删除：该供应商可能正在被采购单等订单引用。" }, { status: 500 });
  }
}
