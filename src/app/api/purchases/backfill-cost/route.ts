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

    await prisma.$transaction(async (tx) => {
      // 1. 分类处理传入的数据项目
      const bindItems = items.filter((item) => item.outboundOrderItemId && item.purchaseOrderItemId);
      const manualOnlyItems = items.filter((item) => item.outboundOrderItemId && !item.purchaseOrderItemId);
      const regularItems = items.filter((item) => !item.outboundOrderItemId && item.purchaseOrderItemId);

      const costPriceByPurchaseOrderItemId = new Map<string, number>();

      // A. 先处理补录绑定匹配（包含出库单明细 ID 和采购批次 ID）
      for (const item of bindItems) {
        const outboundItemId = String(item.outboundOrderItemId).trim();
        const purchaseOrderItemId = String(item.purchaseOrderItemId).trim();
        const costPrice = Number(item.costPrice);
        const deductQty = Number(item.quantity || 1);

        if (!outboundItemId || !purchaseOrderItemId || !Number.isFinite(costPrice) || costPrice < 0) {
          throw new Error(`回填数据项无效: ${JSON.stringify(item)}`);
        }

        // 校验采购入库批次
        const dbPurchaseItem = await tx.purchaseOrderItem.findUnique({
          where: { id: purchaseOrderItemId },
          include: { purchaseOrder: true },
        });

        if (
          !dbPurchaseItem ||
          dbPurchaseItem.purchaseOrder.userId !== session.id ||
          dbPurchaseItem.purchaseOrder.status !== "Received"
        ) {
          throw new Error("部分入库批次未找到，或对应的单据未入库、不属于当前用户");
        }

        // 校验出库明细项
        const dbOutboundItem = await tx.outboundOrderItem.findUnique({
          where: { id: outboundItemId },
          include: { outboundOrder: true },
        });

        if (!dbOutboundItem || dbOutboundItem.outboundOrder.userId !== session.id) {
          throw new Error("对应的出库明细项未找到，或不属于当前用户");
        }

        // 写入并更新该出库明细的快照 costSnapshot，追加该批次关联（回填成本仅关联批次用于计价对账，绝不扣减库存数量，防止二次扣减）
        const snapshot = parseOutboundCostSnapshot(dbOutboundItem.costSnapshot) || {
          quantity: dbOutboundItem.quantity,
          totalCost: 0,
          averageUnitCost: 0,
          batches: [],
        };

        const existingBatch = snapshot.batches.find((b) => b.purchaseOrderItemId === purchaseOrderItemId);
        if (existingBatch) {
          existingBatch.quantity += deductQty;
          existingBatch.unitCost = costPrice;
          existingBatch.totalCost = FinanceMath.multiply(existingBatch.quantity, costPrice);
        } else {
          snapshot.batches.push({
            purchaseOrderItemId,
            quantity: deductQty,
            unitCost: costPrice,
            totalCost: FinanceMath.multiply(deductQty, costPrice),
          });
        }

        const nextTotalCost = snapshot.batches.reduce((sum, b) => FinanceMath.add(sum, b.totalCost), 0);
        const nextAverageUnitCost = snapshot.quantity > 0 ? FinanceMath.divide(nextTotalCost, snapshot.quantity) : 0;

        await tx.outboundOrderItem.update({
          where: { id: outboundItemId },
          data: {
            costSnapshot: {
              quantity: snapshot.quantity,
              totalCost: nextTotalCost,
              averageUnitCost: nextAverageUnitCost,
              batches: snapshot.batches,
            } as Prisma.InputJsonValue,
          },
        });

        costPriceByPurchaseOrderItemId.set(purchaseOrderItemId, costPrice);
      }

      // B. 处理纯手动兜底回填（仅有出库单明细 ID，没有可用入库批次）
      for (const item of manualOnlyItems) {
        const outboundItemId = String(item.outboundOrderItemId).trim();
        const costPrice = Number(item.costPrice);

        if (!outboundItemId || !Number.isFinite(costPrice) || costPrice < 0) {
          throw new Error(`手动回填数据项无效: ${JSON.stringify(item)}`);
        }

        const dbOutboundItem = await tx.outboundOrderItem.findUnique({
          where: { id: outboundItemId },
          include: { outboundOrder: true },
        });

        if (!dbOutboundItem || dbOutboundItem.outboundOrder.userId !== session.id) {
          throw new Error("对应的出库明细项未找到，或不属于当前用户");
        }

        const qty = dbOutboundItem.quantity;
        const totalCost = FinanceMath.multiply(costPrice, qty);

        const nextSnapshot = {
          quantity: qty,
          totalCost: totalCost,
          averageUnitCost: costPrice,
          batches: [],
        };

        await tx.outboundOrderItem.update({
          where: { id: outboundItemId },
          data: {
            costSnapshot: nextSnapshot as Prisma.InputJsonValue,
          },
        });
      }

      // C. 处理常规回填（只含有采购批次ID的价格变动同步）
      for (const item of regularItems) {
        const id = String(item.purchaseOrderItemId || "").trim();
        const costPrice = Number(item.costPrice);
        if (!id || !Number.isFinite(costPrice) || costPrice < 0) {
          throw new Error(`常规回填数据项无效: ${JSON.stringify(item)}`);
        }
        costPriceByPurchaseOrderItemId.set(id, costPrice);
      }

      // D. 统一同步采购批次的新采购单价，并重新计算关联的出库成本和利润
      if (costPriceByPurchaseOrderItemId.size > 0) {
        const allPurchaseItemIds = Array.from(costPriceByPurchaseOrderItemId.keys());
        const dbItems = await tx.purchaseOrderItem.findMany({
          where: {
            id: { in: allPurchaseItemIds },
            purchaseOrder: {
              userId: session.id,
              status: "Received",
            },
          },
          include: {
            purchaseOrder: true,
          },
        });

        if (dbItems.length !== costPriceByPurchaseOrderItemId.size) {
          throw new Error("部分入库批次未找到，或对应的单据未入库、不属于当前用户");
        }

        // 更新采购明细的价格
        for (const dbItem of dbItems) {
          const nextCostPrice = costPriceByPurchaseOrderItemId.get(dbItem.id)!;
          await tx.purchaseOrderItem.update({
            where: { id: dbItem.id },
            data: {
              costPrice: nextCostPrice,
            },
          });
        }

        // 按采购单重新计算 totalAmount
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

        // 统一更新和价格联动有关的出库快照数据
        await syncOutboundCostSnapshotsForPurchaseItems(
          tx,
          session.id,
          costPriceByPurchaseOrderItemId
        );
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to batch backfill cost:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to batch backfill cost",
    }, { status: 500 });
  }
}
