import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUserAny } from "@/lib/auth";
import { getOutboundReturnedBatchQuantityMap, getOutboundReturnedQuantityMap, parseOutboundReturnMeta } from "@/lib/outboundReturnMeta";
import { parseOutboundNote } from "@/lib/utils";
import { InventoryService } from "@/services/inventoryService";
import { randomUUID } from "crypto";

const ENSURE_INVENTORY_ADJUSTMENT_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS "InventoryAdjustment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "purchaseOrderItemId" TEXT NOT NULL REFERENCES "PurchaseOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "quantity" INTEGER NOT NULL,
  "beforeQuantity" INTEGER NOT NULL,
  "afterQuantity" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

function parseCostSnapshot(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const batches = Array.isArray(raw.batches)
    ? raw.batches.flatMap((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
        const record = entry as Record<string, unknown>;
        const purchaseOrderItemId = String(record.purchaseOrderItemId || "").trim();
        const quantity = Math.max(0, Number(record.quantity || 0));
        if (!purchaseOrderItemId || quantity <= 0) return [];
        return [{
          purchaseOrderItemId,
          quantity,
          unitCost: Number(record.unitCost || 0) || 0,
          totalCost: Number(record.totalCost || 0) || 0,
        }];
      })
    : [];

  return { batches };
}

function readPlatformOrderNo(note: string | null | undefined) {
  const match = String(note || "").match(/平台单号[:：]\s*([^\s|]+)/);
  return String(match?.[1] || "").trim() || null;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ itemId: string }> }
) {
  try {
    const user = await getAuthorizedUserAny("purchase:manage", "outbound:manage");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { itemId } = await context.params;
    const purchaseItemId = String(itemId || "").trim();
    if (!purchaseItemId) {
      return NextResponse.json({ error: "缺少入库批次 ID" }, { status: 400 });
    }

    const purchaseItem = await prisma.purchaseOrderItem.findFirst({
      where: {
        id: purchaseItemId,
        purchaseOrder: { userId: user.id },
      },
      select: {
        id: true,
        quantity: true,
        remainingQuantity: true,
        costPrice: true,
        productId: true,
        shopProductId: true,
        purchaseOrder: {
          select: {
            id: true,
            date: true,
            status: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
          },
        },
        shopProduct: {
          select: {
            id: true,
            productName: true,
            sku: true,
            shop: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!purchaseItem) {
      return NextResponse.json({ error: "入库批次不存在" }, { status: 404 });
    }

    // 聚合该商品在系统中的所有可能关联标识（包括店铺商品ID、主库商品ID、以及同源主库商品的其他店铺商品ID）
    const relatedProductIds = new Set<string>();
    const relatedShopProductIds = new Set<string>();

    if (purchaseItem.productId) {
      relatedProductIds.add(purchaseItem.productId);
    }
    if (purchaseItem.shopProductId) {
      relatedShopProductIds.add(purchaseItem.shopProductId);
      const sp = await prisma.shopProduct.findUnique({
        where: { id: purchaseItem.shopProductId },
        select: { productId: true },
      });
      if (sp?.productId) {
        relatedProductIds.add(sp.productId);
      }
    }

    if (relatedProductIds.size > 0) {
      const peerShopProducts = await prisma.shopProduct.findMany({
        where: {
          productId: { in: Array.from(relatedProductIds) },
          shop: { userId: user.id },
        },
        select: { id: true },
      });
      for (const p of peerShopProducts) {
        relatedShopProductIds.add(p.id);
      }
    }

    const itemWhere: Array<{ productId?: string; shopProductId?: string }> = [
      ...Array.from(relatedShopProductIds).map((id) => ({ shopProductId: id })),
      ...Array.from(relatedProductIds).map((id) => ({ productId: id })),
    ];

    const outbounds = itemWhere.length > 0 ? await prisma.outboundOrder.findMany({
      where: {
        userId: user.id,
        items: {
          some: {
            OR: itemWhere,
          },
        },
      },
      select: {
        id: true,
        type: true,
        date: true,
        note: true,
        status: true,
        items: {
          select: {
            id: true,
            quantity: true,
            price: true,
            productId: true,
            shopProductId: true,
            costSnapshot: true,
            product: { select: { id: true, name: true, sku: true } },
            shopProduct: {
              select: {
                id: true,
                productName: true,
                sku: true,
                shop: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { date: "desc" },
      take: 500,
    }) : [];

    const rows = outbounds.flatMap((order) => {
      const returnEntries = parseOutboundReturnMeta(order.note).returns;
      const returnedMap = getOutboundReturnedQuantityMap(returnEntries);
      const noteMeta = parseOutboundNote(order.note);

      return order.items.flatMap((item) => {
        const snapshot = parseCostSnapshot(item.costSnapshot);
        const matchedBatches = snapshot?.batches.filter((batch) => batch.purchaseOrderItemId === purchaseItemId) || [];
        if (matchedBatches.length === 0) return [];

        const quantity = matchedBatches.reduce((sum, batch) => sum + batch.quantity, 0);
        const totalCost = matchedBatches.reduce((sum, batch) => sum + batch.totalCost, 0);
        const returnedFromBatch = returnEntries.reduce((sum, entry) => sum + entry.items
          .filter((returnedItem) => returnedItem.outboundOrderItemId === item.id)
          .flatMap((returnedItem) => returnedItem.batches || [])
          .filter((batch) => batch.purchaseOrderItemId === purchaseItemId)
          .reduce((batchSum, batch) => batchSum + batch.quantity, 0), 0);
        const returnedQuantity = Math.min(quantity, returnedFromBatch || returnedMap.get(item.id) || 0);

        return [{
          outboundOrderId: order.id,
          outboundOrderItemId: item.id,
          date: order.date,
          type: order.type,
          status: order.status,
          orderNo: readPlatformOrderNo(order.note),
          platform: noteMeta.platform || null,
          shopName: item.shopProduct?.shop?.name || noteMeta.shopName || null,
          productName: item.shopProduct?.productName || item.product?.name || "未命名商品",
          sku: item.shopProduct?.sku || item.product?.sku || null,
          quantity,
          returnedQuantity,
          netQuantity: Math.max(0, quantity - returnedQuantity),
          unitCost: quantity > 0 ? totalCost / quantity : 0,
          totalCost,
        }];
      });
    });

    const orderNos = Array.from(new Set(rows.map((row) => row.orderNo).filter((value): value is string => Boolean(value))));
    const salesOrders = orderNos.length > 0 ? await prisma.autoPickOrder.findMany({
      where: {
        userId: user.id,
        orderNo: { in: orderNos },
      },
      select: {
        id: true,
        platform: true,
        dailyPlatformSequence: true,
        orderNo: true,
        orderTime: true,
        status: true,
        actualPaid: true,
        expectedIncome: true,
        userAddress: true,
        customerRemark: true,
        items: {
          select: {
            id: true,
            productName: true,
            productNo: true,
            quantity: true,
            thumb: true,
          },
        },
      },
    }) : [];
    const salesOrderByNo = new Map(salesOrders.map((order) => [order.orderNo, order]));
    const groupedOrders = Array.from(rows.reduce((map, row) => {
      const key = row.orderNo || row.outboundOrderId;
      const current = map.get(key);
      if (current) {
        current.batchQuantity += row.quantity;
        current.returnedQuantity += row.returnedQuantity;
        current.netQuantity += row.netQuantity;
        current.batchCost += row.totalCost;
        current.outboundItems.push(row);
        return map;
      }
      map.set(key, {
        key,
        salesOrder: row.orderNo ? salesOrderByNo.get(row.orderNo) || null : null,
        orderNo: row.orderNo,
        platform: row.platform,
        shopName: row.shopName,
        date: row.date,
        status: row.status,
        type: row.type,
        outboundOrderId: row.outboundOrderId,
        batchQuantity: row.quantity,
        returnedQuantity: row.returnedQuantity,
        netQuantity: row.netQuantity,
        batchCost: row.totalCost,
        outboundItems: [row],
      });
      return map;
    }, new Map<string, {
      key: string;
      salesOrder: (typeof salesOrders)[number] | null;
      orderNo: string | null;
      platform: string | null;
      shopName: string | null;
      date: Date;
      status: string;
      type: string;
      outboundOrderId: string;
      batchQuantity: number;
      returnedQuantity: number;
      netQuantity: number;
      batchCost: number;
      outboundItems: typeof rows;
    }>()).values()).sort((a, b) => new Date(b.salesOrder?.orderTime || b.date).getTime() - new Date(a.salesOrder?.orderTime || a.date).getTime());

    const totals = rows.reduce((acc, row) => {
      acc.outboundQuantity += row.quantity;
      acc.returnedQuantity += row.returnedQuantity;
      acc.netQuantity += row.netQuantity;
      acc.totalCost += row.totalCost;
      return acc;
    }, {
      inboundQuantity: purchaseItem.quantity,
      remainingQuantity: purchaseItem.remainingQuantity ?? null,
      outboundQuantity: 0,
      returnedQuantity: 0,
      netQuantity: 0,
      totalCost: 0,
    });

    let actualRemainingQuantity = purchaseItem.remainingQuantity ?? purchaseItem.quantity;
    let expectedRemainingQuantity = Math.max(0, purchaseItem.quantity - totals.netQuantity);

    // 自动修复逻辑：若该批次的所有出库已全部退回对冲(totals.netQuantity === 0)，但历史剩余数量落后
    // 自动补正该批次剩余库存，并同步商品物理库存，彻底消除“检测到批次库存差异”横幅
    if (totals.netQuantity === 0 && actualRemainingQuantity !== expectedRemainingQuantity) {
      const beforeQty = actualRemainingQuantity;
      const targetQty = expectedRemainingQuantity;
      await prisma.$transaction(async (tx) => {
        await tx.purchaseOrderItem.update({
          where: { id: purchaseItemId },
          data: { remainingQuantity: targetQty },
        });
        await tx.productBatch.updateMany({
          where: { purchaseOrderItemId: purchaseItemId },
          data: { remainingStock: targetQty },
        });
        await InventoryService.syncStockFromBatches(tx, purchaseItem.productId, purchaseItem.shopProductId);
        await tx.$executeRawUnsafe(ENSURE_INVENTORY_ADJUSTMENT_TABLE_SQL);
        await tx.$executeRawUnsafe(
          `INSERT INTO "InventoryAdjustment"
            ("id", "userId", "purchaseOrderItemId", "quantity", "beforeQuantity", "afterQuantity", "reason")
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          randomUUID(),
          user.id,
          purchaseItemId,
          targetQty - beforeQty,
          beforeQty,
          targetQty,
          "出库已全部退回，系统自动补正批次剩余库存"
        );
      }).catch((err) => console.error("Auto heal batch remaining quantity failed:", err));
      actualRemainingQuantity = targetQty;
      expectedRemainingQuantity = targetQty;
    }

    await prisma.$executeRawUnsafe(ENSURE_INVENTORY_ADJUSTMENT_TABLE_SQL);
    const adjustments = await prisma.$queryRawUnsafe<Array<{
      id: string;
      quantity: number;
      beforeQuantity: number;
      afterQuantity: number;
      reason: string;
      createdAt: Date;
    }>>(
      `SELECT "id", "quantity", "beforeQuantity", "afterQuantity", "reason", "createdAt"
       FROM "InventoryAdjustment"
       WHERE "userId" = $1 AND "purchaseOrderItemId" = $2
       ORDER BY "createdAt" DESC LIMIT 20`,
      user.id,
      purchaseItemId
    );

    return NextResponse.json({
      purchaseItem: {
        ...purchaseItem,
        remainingQuantity: actualRemainingQuantity,
      },
      totals,
      reconciliation: {
        actualRemainingQuantity,
        expectedRemainingQuantity,
        adjustmentQuantity: expectedRemainingQuantity - actualRemainingQuantity,
      },
      adjustments,
      orders: groupedOrders.map((o) => ({
        ...o,
        isFullyReturned: o.netQuantity === 0 && o.returnedQuantity > 0,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch purchase item outbound trace:", error);
    return NextResponse.json({ error: "查询批次出库记录失败" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ itemId: string }> }
) {
  try {
    const user = await getAuthorizedUserAny("purchase:manage", "outbound:manage");
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { itemId } = await context.params;
    const purchaseOrderItemId = String(itemId || "").trim();
    const body = await request.json().catch(() => ({}));
    const reason = String(body?.reason || "历史订单改匹配遗留库存修复").trim();

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(ENSURE_INVENTORY_ADJUSTMENT_TABLE_SQL);
      const purchaseItem = await tx.purchaseOrderItem.findFirst({
        where: {
          id: purchaseOrderItemId,
          purchaseOrder: { userId: user.id, status: "Received" },
        },
        select: {
          id: true,
          quantity: true,
          remainingQuantity: true,
          productId: true,
          shopProductId: true,
        },
      });
      if (!purchaseItem) throw new Error("入库批次不存在或尚未入库");

      const relatedProductIds = new Set<string>();
      const relatedShopProductIds = new Set<string>();
      if (purchaseItem.productId) relatedProductIds.add(purchaseItem.productId);
      if (purchaseItem.shopProductId) {
        relatedShopProductIds.add(purchaseItem.shopProductId);
        const sp = await tx.shopProduct.findUnique({
          where: { id: purchaseItem.shopProductId },
          select: { productId: true },
        });
        if (sp?.productId) relatedProductIds.add(sp.productId);
      }
      if (relatedProductIds.size > 0) {
        const peerShopProducts = await tx.shopProduct.findMany({
          where: {
            productId: { in: Array.from(relatedProductIds) },
            shop: { userId: user.id },
          },
          select: { id: true },
        });
        for (const p of peerShopProducts) {
          relatedShopProductIds.add(p.id);
        }
      }

      const itemWhere: Array<{ productId?: string; shopProductId?: string }> = [
        ...Array.from(relatedShopProductIds).map((id) => ({ shopProductId: id })),
        ...Array.from(relatedProductIds).map((id) => ({ productId: id })),
      ];

      const outbounds = itemWhere.length > 0 ? await tx.outboundOrder.findMany({
        where: {
          userId: user.id,
          items: {
            some: {
              OR: itemWhere,
            },
          },
        },
        select: {
          note: true,
          items: { select: { costSnapshot: true } },
        },
      }) : [];

      let consumedQuantity = 0;
      let returnedQuantity = 0;
      for (const outbound of outbounds) {
        returnedQuantity += getOutboundReturnedBatchQuantityMap(
          parseOutboundReturnMeta(outbound.note).returns
        ).get(purchaseOrderItemId) || 0;
        for (const item of outbound.items) {
          const snapshot = parseCostSnapshot(item.costSnapshot);
          consumedQuantity += snapshot?.batches
            .filter((batch) => batch.purchaseOrderItemId === purchaseOrderItemId)
            .reduce((sum, batch) => sum + batch.quantity, 0) || 0;
        }
      }

      const netConsumedQuantity = Math.max(0, consumedQuantity - returnedQuantity);
      const expectedRemainingQuantity = Math.max(0, purchaseItem.quantity - netConsumedQuantity);
      const beforeQuantity = purchaseItem.remainingQuantity ?? purchaseItem.quantity;
      const adjustmentQuantity = expectedRemainingQuantity - beforeQuantity;
      if (adjustmentQuantity === 0) {
        throw new Error("当前批次库存与有效出库记录一致，无需校准");
      }

      await tx.purchaseOrderItem.update({
        where: { id: purchaseOrderItemId },
        data: { remainingQuantity: expectedRemainingQuantity },
      });
      await tx.productBatch.updateMany({
        where: { purchaseOrderItemId },
        data: { remainingStock: expectedRemainingQuantity },
      });
      await InventoryService.syncStockFromBatches(tx, purchaseItem.productId, purchaseItem.shopProductId);

      let latestProductStock: number | null = null;
      let latestShopProductStock: number | null = null;
      let targetProductId = purchaseItem.productId;
      let targetShopProductId = purchaseItem.shopProductId;

      if (!targetProductId && targetShopProductId) {
        const sp = await tx.shopProduct.findUnique({
          where: { id: targetShopProductId },
          select: { productId: true },
        });
        if (sp?.productId) {
          targetProductId = sp.productId;
        }
      }

      if (targetProductId && !targetShopProductId) {
        const sp = await tx.shopProduct.findFirst({
          where: { productId: targetProductId },
          select: { id: true },
        });
        if (sp?.id) {
          targetShopProductId = sp.id;
        }
      }

      if (targetProductId) {
        const p = await tx.product.findUnique({
          where: { id: targetProductId },
          select: { stock: true },
        });
        if (p) latestProductStock = p.stock;
      }

      if (targetShopProductId) {
        const sp = await tx.shopProduct.findUnique({
          where: { id: targetShopProductId },
          select: { stock: true },
        });
        if (sp) latestShopProductStock = sp.stock;
      }

      const adjustmentId = randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO "InventoryAdjustment"
          ("id", "userId", "purchaseOrderItemId", "quantity", "beforeQuantity", "afterQuantity", "reason")
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        adjustmentId,
        user.id,
        purchaseOrderItemId,
        adjustmentQuantity,
        beforeQuantity,
        expectedRemainingQuantity,
        reason
      );
      const adjustment = {
        id: adjustmentId,
        quantity: adjustmentQuantity,
        beforeQuantity,
        afterQuantity: expectedRemainingQuantity,
        reason,
      };

      return {
        adjustment,
        expectedRemainingQuantity,
        productId: targetProductId,
        shopProductId: targetShopProductId,
        latestProductStock,
        latestShopProductStock,
      };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Failed to reconcile purchase batch inventory:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "库存校准失败" },
      { status: 400 }
    );
  }
}
