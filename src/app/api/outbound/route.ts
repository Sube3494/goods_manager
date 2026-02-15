import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { OutboundOrderItem, Prisma } from '../../../../prisma/generated-client';
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";

export async function GET() {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "outbound:read")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const orders = await prisma.outboundOrder.findMany({
      where: {
        workspaceId: session.workspaceId
      },
      include: {
        items: {
          include: {
            product: true
          }
        }
      },
      orderBy: {
        date: 'desc'
      }
    });
    return NextResponse.json(orders);
  } catch (error) {
    console.error("Failed to fetch outbound orders:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "outbound:create")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const body = await request.json();
    const { type, date, note, items } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Invalid items" }, { status: 400 });
    }

    // Use a transaction to ensure data consistency
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Create the OutboundOrder
      const order = await tx.outboundOrder.create({
        data: {
          type: type || "Sale",
          date: date ? new Date(date) : new Date(),
          note: note || "",
          workspaceId: session.workspaceId,
          items: {
            create: items.map((item: OutboundOrderItem) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: item.price || 0
            }))
          }
        }
      });

      // 2. Process FIFO deduction for each item
      for (const item of items) {
        let remainingToDeduct = item.quantity;

        // Find all available batches for this product, ordered by date (oldest first)
        const batches = await tx.purchaseOrderItem.findMany({
          where: {
            productId: item.productId,
            remainingQuantity: {
                gt: 0
            },
            purchaseOrder: {
                status: "Received"
            }
          },
          orderBy: {
            purchaseOrder: {
                date: 'asc'
            }
          }
        });

        for (const batch of batches) {
          if (remainingToDeduct <= 0) break;

          const batchRemaining = batch.remainingQuantity || 0;
          const deductFromThisBatch = Math.min(batchRemaining, remainingToDeduct);

          await tx.purchaseOrderItem.update({
            where: { id: batch.id },
            data: {
              remainingQuantity: {
                decrement: deductFromThisBatch
              }
            }
          });

          remainingToDeduct -= deductFromThisBatch;
        }

        // 3. Update the global product stock
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: {
              decrement: item.quantity
            }
          }
        });
      }

      return order;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Outbound processing failed:", error);
    return NextResponse.json({ error: "Failed to process outbound order" }, { status: 500 });
  }
}
