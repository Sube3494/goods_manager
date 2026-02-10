import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const batches = await prisma.purchaseOrderItem.findMany({
      where: {
        productId: params.id,
        remainingQuantity: {
          gt: 0
        },
        purchaseOrder: {
          status: "Received"
        }
      },
      include: {
        purchaseOrder: true
      },
      orderBy: {
        purchaseOrder: {
          date: 'asc'
        }
      }
    });

    return NextResponse.json(batches);
  } catch (error) {
    console.error("Failed to fetch product batches:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
