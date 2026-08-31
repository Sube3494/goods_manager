import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUserAny } from "@/lib/auth";
import { getOutboundReturnedQuantityMap, parseOutboundReturnMeta } from "@/lib/outboundReturnMeta";
import { parseOutboundNote } from "@/lib/utils";

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

    const itemWhere = [
      purchaseItem.shopProduct?.id ? { shopProductId: purchaseItem.shopProduct.id } : null,
      purchaseItem.product?.id ? { productId: purchaseItem.product.id } : null,
    ].filter((item): item is { shopProductId: string } | { productId: string } => Boolean(item));

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
      const returnedMap = getOutboundReturnedQuantityMap(parseOutboundReturnMeta(order.note).returns);
      const noteMeta = parseOutboundNote(order.note);

      return order.items.flatMap((item) => {
        const snapshot = parseCostSnapshot(item.costSnapshot);
        const matchedBatches = snapshot?.batches.filter((batch) => batch.purchaseOrderItemId === purchaseItemId) || [];
        if (matchedBatches.length === 0) return [];

        const quantity = matchedBatches.reduce((sum, batch) => sum + batch.quantity, 0);
        const totalCost = matchedBatches.reduce((sum, batch) => sum + batch.totalCost, 0);
        const returnedQuantity = Math.min(quantity, returnedMap.get(item.id) || 0);

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

    return NextResponse.json({
      purchaseItem,
      totals,
      items: rows,
    });
  } catch (error) {
    console.error("Failed to fetch purchase item outbound trace:", error);
    return NextResponse.json({ error: "查询批次出库记录失败" }, { status: 500 });
  }
}
