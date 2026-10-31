import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string, itemId: string }> }) {
  try {
    const session = await getAuthorizedUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    if (!hasPermission(session as SessionUser, "setup_purchase:manage") || !hasPermission(session as SessionUser, "setup_purchase:delete")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id, itemId } = await params;
    
    await prisma.storeOpeningItem.delete({
      where: { id: itemId, batchId: id, batch: { userId: session.id } }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("DELETE Error:", error);
    return NextResponse.json({ 
      error: "Server Error", 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string, itemId: string }> }) {
  try {
    const session = await getAuthorizedUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    if (!hasPermission(session as SessionUser, "setup_purchase:manage") || !hasPermission(session as SessionUser, "setup_purchase:update")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id, itemId } = await params;

    const data = await req.json();


    const updated = await prisma.storeOpeningItem.update({
      where: { id: itemId, batchId: id, batch: { userId: session.id } },
      data: {
        checked: typeof data.checked === 'boolean' ? data.checked : undefined
      }
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("PATCH Error:", error);
    return NextResponse.json({ 
      error: "Server Error", 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string, itemId: string }> }) {
  try {
    const session = await getAuthorizedUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    if (!hasPermission(session as SessionUser, "setup_purchase:manage") || !hasPermission(session as SessionUser, "setup_purchase:update")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id, itemId } = await params;

    const data = await req.json();


    // Safer number conversion
    const parseNum = (val: unknown) => {
        if (val === undefined || val === null) return undefined;
        const res = typeof val === 'string' ? parseFloat(val) : (val as number);
        return isNaN(res) ? undefined : res;
    };
    
    const parseIntNum = (val: unknown) => {
        if (val === undefined || val === null) return undefined;
        const res = typeof val === 'string' ? parseInt(val) : Math.floor(val as number);
        return isNaN(res) ? undefined : res;
    };

    const qty = parseIntNum(data.quantity);
    const price = parseNum(data.unitPrice);
    const fee = parseNum(data.shippingFee);

    // 如果前端直接传了 totalAmount 就用，否则重算
    let total = parseNum(data.totalAmount);
    if (total === undefined && qty !== undefined && price !== undefined) {
      const currentFee = fee ?? 0;
      total = qty * price + currentFee;
    }

    const updated = await prisma.storeOpeningItem.update({
      where: { id: itemId, batchId: id, batch: { userId: session.id } },
      data: {
        productName: data.productName !== undefined ? data.productName : undefined,
        productCode: data.productCode !== undefined ? data.productCode : undefined,
        quantity: qty,
        unitPrice: price,
        shippingFee: fee,
        totalAmount: total,
        remark: data.remark !== undefined ? data.remark : undefined,
      }
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("PUT Error:", error);
    return NextResponse.json({ 
      error: "Server Error", 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}
