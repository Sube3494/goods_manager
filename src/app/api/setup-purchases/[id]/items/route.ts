import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAuthorizedUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    if (!hasPermission(session as SessionUser, "setup_purchase:manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    
    const data = await req.json();
    
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
