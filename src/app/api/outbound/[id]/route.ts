import { NextResponse } from "next/server";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { returnOutboundOrderById } from "@/lib/outboundReturns";

/**
 * 实现“退货入库”逻辑 (对冲出库)
 * 不再物理删除，而是标记状态并恢复库存
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "outbound:manage")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({ reason: "退货入库" }));

    const result = await returnOutboundOrderById(session.id, id, body);

    return NextResponse.json({ success: true, order: result });
  } catch (error) {
    console.error("Failed to return outbound order:", error);
    const message = error instanceof Error ? error.message : "Failed to process return";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import prisma from "@/lib/prisma";
import { InventoryService } from "@/services/inventoryService";
import { parseOutboundReturnMeta, getOutboundReturnedQuantityMap } from "@/lib/outboundReturnMeta";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "outbound:manage")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const targetId = String(id || "").trim();
    if (!targetId) {
      return NextResponse.json({ error: "缺少出库单 ID" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.outboundOrder.findFirst({
        where: { id: targetId, userId: session.id },
        include: { items: true },
      });

      if (!order) {
        throw new Error("出库单不存在或无权删除");
      }

      // 校验：如果单据未标记为 Returned，检查是否已全额退回
      if (order.status !== "Returned") {
        const returnEntries = parseOutboundReturnMeta(order.note).returns;
        const returnedMap = getOutboundReturnedQuantityMap(returnEntries);
        const hasUnreturnedItems = order.items.some((it) => {
          const returned = returnedMap.get(it.id) || 0;
          return it.quantity > returned;
        });

        if (hasUnreturnedItems) {
          throw new Error("该出库单尚有未退回商品，请先执行退货对冲后再删除单据");
        }
      }

      const touchedProductIds = new Set<string>();
      const touchedShopProductIds = new Set<string>();
      for (const it of order.items) {
        if (it.productId) touchedProductIds.add(it.productId);
        if (it.shopProductId) touchedShopProductIds.add(it.shopProductId);
      }

      await tx.outboundOrderItem.deleteMany({
        where: { outboundOrderId: targetId },
      });

      await tx.outboundOrder.delete({
        where: { id: targetId },
      });

      for (const spId of touchedShopProductIds) {
        await InventoryService.syncStockFromBatches(tx, null, spId);
      }
      for (const pId of touchedProductIds) {
        await InventoryService.syncStockFromBatches(tx, pId, null);
      }

      return { deletedId: targetId };
    });

    return NextResponse.json({ success: true, message: "出库记录已彻底清除", ...result });
  } catch (error) {
    console.error("Failed to delete outbound order:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除出库单失败" },
      { status: 400 }
    );
  }
}
