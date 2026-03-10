/*
 * @Date: 2026-03-10 23:19:18
 * @Author: Sube
 * @FilePath: route.ts
 * @LastEditTime: 2026-03-11 02:01:41
 * @Description: 
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAuthorizedUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { id } = await params;
    const batch = await prisma.storeOpeningBatch.findUnique({
      where: { id, userId: session.id },
      include: {
        items: {
          include: { 
            product: {
              include: { supplier: true }
            } 
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // 汇总总金额
    let totalAmount = 0;
    
    batch.items.forEach(item => {
      totalAmount += item.totalAmount;
    });

    return NextResponse.json({
      ...batch,
      summary: {
        total: totalAmount
      }
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAuthorizedUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    if (!hasPermission(session as SessionUser, "setup_purchase:manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    
    const { id } = await params;
    const { name, date } = await req.json();
  
    const batch = await prisma.storeOpeningBatch.update({
      where: { id, userId: session.id },
      data: { name, date: date ? new Date(date) : undefined }
    });
  
    return NextResponse.json(batch);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAuthorizedUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    if (!hasPermission(session as SessionUser, "setup_purchase:manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    
    await prisma.storeOpeningBatch.delete({
      where: { id, userId: session.id }
    });
  
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
