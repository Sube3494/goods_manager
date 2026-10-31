import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAuthorizedUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    if (!hasPermission(session as SessionUser, "setup_purchase:manage") || !hasPermission(session as SessionUser, "setup_purchase:create")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    
    const batch = await prisma.storeOpeningBatch.findFirst({
      where: { id, userId: session.id }, select: { id: true },
    });
    if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });

    const data = await req.json();
    const submittedItems = Array.isArray(data) ? data : [data];
    const productIds = [...new Set<string>(submittedItems.map(item => item.productId).filter((value): value is string => typeof value === "string" && value.length > 0))];
    if (productIds.length) {
      const products = await prisma.product.findMany({
        where: { id: { in: productIds }, userId: session.id }, select: { id: true },
      });
      if (products.length !== productIds.length) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
      }
    }
    
    interface ItemInput {
      productCode?: string;
      productName?: string;
      productId?: string;
      quantity?: string | number;
      unitPrice?: string | number;
      totalAmount?: string | number;
      remark?: string;
    }


    if (Array.isArray(data)) {
        const items = await prisma.storeOpeningItem.createMany({
            data: data.map((item: ItemInput) => ({
                batchId: id,
                productCode: item.productCode || null,
                productName: item.productName || null,
                productId: item.productId || null,
                channel: null,
                quantity: parseInt(item.quantity?.toString() || "1") || 1,
                unitPrice: parseFloat(item.unitPrice?.toString() || "0") || 0,
                totalAmount: parseFloat(item.totalAmount?.toString() || "0") || ((parseFloat(item.quantity?.toString() || "1") || 1) * (parseFloat(item.unitPrice?.toString() || "0") || 0)),
                remark: item.remark || null,
            }))
        });
        return NextResponse.json(items, { status: 201 });
    }

    const item = await prisma.storeOpeningItem.create({
      data: {
        batchId: id,
        productCode: data.productCode || null,
        productName: data.productName || null,
        productId: data.productId || null,
        channel: null,
        quantity: parseInt(data.quantity) || 1,
        unitPrice: parseFloat(data.unitPrice) || 0,
        totalAmount: parseFloat(data.totalAmount) || ((data.quantity || 1) * (data.unitPrice || 0)),
        remark: data.remark || null,
      }
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
