import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from '../../../../prisma/generated-client';
import { getAuthorizedUser } from "@/lib/auth";
import { InventoryService } from "@/services/inventoryService";
 
interface OutboundItem {
  productId: string;
  quantity: number;
  price?: number;
}

export async function GET() {
  try {
    const user = await getAuthorizedUser("outbound:manage");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    }

    const orders = await prisma.outboundOrder.findMany({
      where: { userId: user.id },
      include: {
        items: {
          include: { product: true }
        }
      },
      orderBy: { date: 'desc' }
    });
    return NextResponse.json(orders);
  } catch (error) {
    console.error("Failed to fetch outbound orders:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthorizedUser("outbound:manage");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    }

    const body = await request.json();
    const { type, date, note, items } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Invalid items" }, { status: 400 });
    }

    // 使用事务确保数据原子性，业务逻辑委托给 InventoryService
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. 创建出库单记录
      const order = await tx.outboundOrder.create({
        data: {
          type: type || "Sale",
          date: date ? new Date(date) : new Date(),
          note: note || "",
          userId: user.id,
          items: {
            create: items.map((item: OutboundItem) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: item.price || 0
            }))
          }
        }
      });

      // 2. 委托 Service 处理 FIFO 扣减及库存更新
      await InventoryService.processOutboundFIFO(tx, user.id, items);

      return order;
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process outbound order";
    console.error("Outbound processing failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
