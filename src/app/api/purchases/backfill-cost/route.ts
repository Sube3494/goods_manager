import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { FinanceMath } from "@/lib/math";
import { Prisma } from "../../../../../prisma/generated-client";

type ParsedOutboundSnapshotBatch = {
  purchaseOrderItemId: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
};

type ParsedOutboundSnapshot = {
  quantity: number;
  totalCost: number;
  averageUnitCost: number;
  batches: ParsedOutboundSnapshotBatch[];
};

function parseOutboundCostSnapshot(value: unknown): ParsedOutboundSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const batches = Array.isArray(raw.batches)
    ? raw.batches
        .map((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return null;
          }
          const batch = entry as Record<string, unknown>;
          const purchaseOrderItemId = String(batch.purchaseOrderItemId || "").trim();
          const quantity = Number(batch.quantity || 0);
          if (!purchaseOrderItemId || !Number.isFinite(quantity) || quantity <= 0) {
            return null;
          }
          const unitCost = Number(batch.unitCost || 0);
          const totalCost = Number(batch.totalCost || 0);
          return {
            purchaseOrderItemId,
            quantity,
            unitCost: Number.isFinite(unitCost) ? unitCost : 0,
            totalCost: Number.isFinite(totalCost) ? totalCost : 0,
          };
        })
        .filter((entry): entry is ParsedOutboundSnapshotBatch => Boolean(entry))
    : [];
  const quantity = Number(raw.quantity || 0);
  const totalCost = Number(raw.totalCost || 0);
  const averageUnitCost = Number(raw.averageUnitCost || 0);
  return {
    quantity: Number.isFinite(quantity) ? quantity : 0,
    totalCost: Number.isFinite(totalCost) ? totalCost : 0,
    averageUnitCost: Number.isFinite(averageUnitCost) ? averageUnitCost : 0,
    batches,
  };
}

function rebuildOutboundCostSnapshot(
  snapshot: ParsedOutboundSnapshot,
  costPriceByPurchaseOrderItemId: Map<string, number>
) {
  let changed = false;
  const nextBatches = snapshot.batches.map((batch) => {
    const nextUnitCost = costPriceByPurchaseOrderItemId.get(batch.purchaseOrderItemId);
    if (nextUnitCost === undefined) {
      return batch;
    }
    changed = true;
    return {
      ...batch,
      unitCost: nextUnitCost,
      totalCost: FinanceMath.multiply(nextUnitCost, batch.quantity),
    };
  });
  if (!changed) {
    return null;
  }
  const nextTotalCost = nextBatches.reduce(
    (sum, batch) => FinanceMath.add(sum, batch.totalCost),
    0
  );
  return {
    quantity: snapshot.quantity,
    totalCost: nextTotalCost,
    averageUnitCost: snapshot.quantity > 0 ? FinanceMath.divide(nextTotalCost, snapshot.quantity) : 0,
    batches: nextBatches,
  };
}

async function syncOutboundCostSnapshotsForPurchaseItems(
  tx: Prisma.TransactionClient,
  purchaseOrderUserId: string | null | undefined,
  costPriceByPurchaseOrderItemId: Map<string, number>
) {
  if (costPriceByPurchaseOrderItemId.size <= 0) {
    return;
  }
  const outboundItems = await tx.outboundOrderItem.findMany({
    where: purchaseOrderUserId
      ? {
          outboundOrder: {
            userId: purchaseOrderUserId,
          },
        }
      : undefined,
    select: {
      id: true,
      costSnapshot: true,
    },
  });
  for (const outboundItem of outboundItems) {
    const snapshot = parseOutboundCostSnapshot(outboundItem.costSnapshot);
    if (!snapshot || snapshot.batches.length <= 0) {
      continue;
    }
    const nextSnapshot = rebuildOutboundCostSnapshot(snapshot, costPriceByPurchaseOrderItemId);
    if (!nextSnapshot) {
      continue;
    }
    await tx.outboundOrderItem.update({
      where: { id: outboundItem.id },
      data: {
        costSnapshot: nextSnapshot as Prisma.InputJsonValue,
      },
    });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 权限检查
    if (!hasPermission(session, "purchase:manage") && !hasPermission(session, "inbound:manage")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { items } = await request.json();
    if (!Array.isArray(items) || items.length <= 0) {
      return NextResponse.json({ error: "Items must be a non-empty array" }, { status: 400 });
    }

    const costPriceByPurchaseOrderItemId = new Map<string, number>();
    for (const item of items) {
      const id = String(item.purchaseOrderItemId || "").trim();
      const costPrice = Number(item.costPrice);
      if (!id || !Number.isFinite(costPrice) || costPrice < 0) {
        return NextResponse.json({ error: `Invalid item data: ${JSON.stringify(item)}` }, { status: 400 });
      }
      costPriceByPurchaseOrderItemId.set(id, costPrice);
    }

    await prisma.$transaction(async (tx) => {
      // 1. 查询这些采购明细，并校验是否属于当前用户、状态为已入库
      const dbItems = await tx.purchaseOrderItem.findMany({
        where: {
          id: { in: Array.from(costPriceByPurchaseOrderItemId.keys()) },
          purchaseOrder: {
            userId: session.id,
            status: "Received",
          },
        },
        include: {
          purchaseOrder: {
            include: {
              items: true,
            },
          },
        },
      });

      if (dbItems.length !== costPriceByPurchaseOrderItemId.size) {
        throw new Error("部分入库批次未找到，或对应的单据未入库、不属于当前用户");
      }

      // 2. 更新明细的采购价
      for (const dbItem of dbItems) {
        const nextCostPrice = costPriceByPurchaseOrderItemId.get(dbItem.id)!;
        await tx.purchaseOrderItem.update({
          where: { id: dbItem.id },
          data: {
            costPrice: nextCostPrice,
          },
        });
      }

      // 3. 按采购单分组重算 totalAmount
      const purchaseOrders = Array.from(
        new Map(dbItems.map((item) => [item.purchaseOrder.id, item.purchaseOrder])).values()
      );
      for (const order of purchaseOrders) {
        const allOrderItems = await tx.purchaseOrderItem.findMany({
          where: { purchaseOrderId: order.id },
        });
        
        let newTotalAmount = 0;
        for (const item of allOrderItems) {
          const price = item.costPrice || 0;
          const qty = item.quantity || 0;
          newTotalAmount = FinanceMath.add(newTotalAmount, FinanceMath.multiply(price, qty));
        }

        await tx.purchaseOrder.update({
          where: { id: order.id },
          data: {
            totalAmount: newTotalAmount,
          },
        });
      }

      // 4. 同步出库成本快照
      await syncOutboundCostSnapshotsForPurchaseItems(
        tx,
        session.id,
        costPriceByPurchaseOrderItemId
      );
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to batch backfill cost:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to batch backfill cost",
    }, { status: 500 });
  }
}
