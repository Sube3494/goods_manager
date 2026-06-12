import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { InventoryService as OutboundInventoryService } from "@/services/inventoryService";
import { buildFactoryShipmentNote, parseFactoryShipmentNote, type FactoryShipmentTrackingEntry } from "@/lib/utils";
import { collectFactoryShipmentCustomer } from "@/lib/customerAddressBook";
import { Prisma } from "../../../../../prisma/generated-client";

type ShipmentItemIdentity = {
  productId?: string | null;
  productVariantId?: string | null;
  shopProductId?: string | null;
  shopProductVariantId?: string | null;
};

function getShipmentItemKey(item: ShipmentItemIdentity) {
  return item.shopProductVariantId || item.productVariantId || item.shopProductId || item.productId || "";
}

function getShipmentItemAliases(item: ShipmentItemIdentity) {
  return Array.from(
    new Set(
      [
        item.shopProductVariantId,
        item.productVariantId,
        item.shopProductId,
        item.productId,
      ].filter((value): value is string => typeof value === "string" && value.trim() !== "")
    )
  );
}

function hasTrackingNumber(entry: Pick<FactoryShipmentTrackingEntry, "trackingNumber"> | null | undefined) {
  return Boolean(entry?.trackingNumber?.trim());
}

function normalizeTrackingEntry(
  entry: FactoryShipmentTrackingEntry | null | undefined,
  itemKeyOverride?: string
): FactoryShipmentTrackingEntry | null {
  if (!entry) return null;

  const itemKey = (itemKeyOverride || entry.itemKey || "").trim();
  if (!itemKey) return null;

  const logisticsName = entry.logisticsName?.trim() || "";
  const trackingNumber = entry.trackingNumber?.trim() || "";
  const shippingFee = Number(entry.shippingFee) || 0;

  if (!trackingNumber && !logisticsName && shippingFee <= 0) {
    return null;
  }

  return {
    itemKey,
    itemName: entry.itemName?.trim() || undefined,
    logisticsName,
    trackingNumber,
    shippingFee,
  };
}

function mergeFactoryShipmentTrackingEntries(
  existingEntries: FactoryShipmentTrackingEntry[],
  incomingEntries: FactoryShipmentTrackingEntry[],
  existingItems: ShipmentItemIdentity[],
  nextItems: ShipmentItemIdentity[]
) {
  const existingEntryMap = new Map<string, FactoryShipmentTrackingEntry>();
  for (const entry of existingEntries) {
    const normalizedEntry = normalizeTrackingEntry(entry);
    if (normalizedEntry) {
      existingEntryMap.set(normalizedEntry.itemKey, normalizedEntry);
    }
  }

  const incomingEntryMap = new Map<string, FactoryShipmentTrackingEntry>();
  for (const entry of incomingEntries) {
    const normalizedEntry = normalizeTrackingEntry(entry);
    if (normalizedEntry) {
      incomingEntryMap.set(normalizedEntry.itemKey, normalizedEntry);
    }
  }

  const existingItemByAlias = new Map<string, ShipmentItemIdentity>();
  for (const item of existingItems) {
    for (const alias of getShipmentItemAliases(item)) {
      existingItemByAlias.set(alias, item);
    }
  }

  const mergedEntries: FactoryShipmentTrackingEntry[] = [];
  for (const item of nextItems) {
    const nextKey = getShipmentItemKey(item);
    if (!nextKey) continue;

    const incomingEntry = incomingEntryMap.get(nextKey);
    const aliases = getShipmentItemAliases(item);
    const matchedExistingItem = aliases
      .map((alias) => existingItemByAlias.get(alias))
      .find((candidate): candidate is ShipmentItemIdentity => Boolean(candidate));
    const carryOverEntry = matchedExistingItem
      ? getShipmentItemAliases(matchedExistingItem)
          .map((alias) => existingEntryMap.get(alias))
          .find((candidate): candidate is FactoryShipmentTrackingEntry => Boolean(candidate))
      : undefined;

    const baseEntry = incomingEntry || carryOverEntry;
    if (!baseEntry) continue;

    const finalEntry = normalizeTrackingEntry(baseEntry, nextKey);
    if (finalEntry) {
      mergedEntries.push(finalEntry);
    }
  }

  return mergedEntries;
}

function deriveFactoryShipmentStatusFromTrackingEntries(
  items: ShipmentItemIdentity[],
  trackingEntries: FactoryShipmentTrackingEntry[],
  fallbackStatus: string
) {
  if (fallbackStatus === "Returned" || fallbackStatus === "已退回") {
    return fallbackStatus;
  }
  if (items.length === 0) {
    return fallbackStatus || "待发货";
  }

  const shippedKeys = new Set(
    trackingEntries
      .filter((entry) => hasTrackingNumber(entry))
      .map((entry) => entry.itemKey)
  );
  const shippedCount = items.filter((item) => {
    const itemKey = getShipmentItemKey(item);
    return itemKey ? shippedKeys.has(itemKey) : false;
  }).length;

  if (shippedCount === 0) return "待发货";
  return shippedCount === items.length ? "已发货" : "部分发货";
}

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

    const { reason } = await request.json().catch(() => ({ reason: "退货入库" }));

    // Use a transaction to reverse stock and update status
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.outboundOrder.findUnique({
        where: { id, userId: session.id },
        include: {
          items: {
            include: {
              shopProduct: true,
              shopProductVariant: true,
            }
          }
        }
      });

      if (!order) {
        throw new Error("Order not found");
      }

      // 防止重复冲销
      if (order.status === "Returned") {
        throw new Error("Order already returned");
      }

      // 1. Reverse stock for each item
      const itemsToCreate = [];
      let totalAmount = 0;
      const isFactoryShipment = order.type === "FactoryShipment";
      const wasDeducted = !isFactoryShipment || order.status === "已发货" || order.status === "部分发货";

      for (const item of order.items) {
        let amountToRestore = item.quantity;

        // Find batches (PurchaseOrderItems) that need restoring
        // We restore to the latest available space first (LIFO restore for FIFO deduction)
          const batches = await tx.purchaseOrderItem.findMany({
            where: {
              ...(item.shopProductVariantId
                ? { shopProductVariantId: item.shopProductVariantId }
                : item.productVariantId
                  ? { productVariantId: item.productVariantId }
                  : item.shopProductId
                    ? { shopProductId: item.shopProductId }
                    : { productId: item.productId }),
              purchaseOrder: {
                userId: session.id,
                status: "Received"
            }
          },
          orderBy: {
            purchaseOrder: {
              date: 'desc'
            }
          }
        });

        // 依据历史最新已入库的采购记录，取得真实的进货成本价
        let costPrice = 0;
        if (batches.length > 0) {
          costPrice = Number(batches[0].costPrice) || 0;
        } else {
          // 若无历史采购记录，回退采用主表上的商品进货成本价
          if (item.shopProductId) {
            if (item.shopProductVariantId) {
              const spv = await tx.shopProductVariant.findUnique({
                where: { id: item.shopProductVariantId }
              });
              costPrice = Number(spv?.costPrice) || 0;
            } else {
            const sp = await tx.shopProduct.findUnique({
              where: { id: item.shopProductId }
            });
            costPrice = Number(sp?.costPrice) || 0;
            }
          } else if (item.productVariantId) {
            const pv = await tx.productVariant.findUnique({
              where: { id: item.productVariantId }
            });
            costPrice = Number(pv?.costPrice) || 0;
          } else if (item.productId) {
            const p = await tx.product.findUnique({
              where: { id: item.productId }
            });
            costPrice = Number(p?.costPrice) || 0;
          }
        }

        itemsToCreate.push({
          productId: item.productId || null,
          productVariantId: item.productVariantId || null,
          shopProductId: item.shopProductId || null,
          shopProductVariantId: item.shopProductVariantId || null,
          variantName: item.variantName || item.shopProductVariant?.variantName || null,
          variantSku: item.variantSku || item.shopProductVariant?.sku || null,
          quantity: item.quantity,
          // 退回对冲单只保留审计记录，实际库存已经通过恢复原采购批次余量处理过了，
          // 这里不能再给它可用余量，否则会把库存重复加一次。
          remainingQuantity: 0,
          costPrice: costPrice
        });

        totalAmount += item.quantity * costPrice;

        if (wasDeducted) {
          for (const batch of batches) {
            if (amountToRestore <= 0) break;

            const currentRemaining = batch.remainingQuantity || 0;
            const originalQty = batch.quantity;
            const spaceInBatch = originalQty - currentRemaining;
            const restoreToThisBatch = Math.min(spaceInBatch, amountToRestore);

            if (restoreToThisBatch > 0) {
              await tx.purchaseOrderItem.update({
                where: { id: batch.id },
                data: {
                  remainingQuantity: {
                    increment: restoreToThisBatch
                  }
                }
              });

              // 同样增加关联的保质期批次库存 ProductBatch 的 remainingStock
              await tx.productBatch.updateMany({
                where: { purchaseOrderItemId: batch.id },
                data: {
                  remainingStock: {
                    increment: restoreToThisBatch
                  }
                }
              });

              amountToRestore -= restoreToThisBatch;
            }
          }
        }
      }

      // 2. Create a corresponding Inbound record (PurchaseOrder)
      const inboundType = order.type === "Sample" ? "InternalReturn" : "Return";
      const inboundId = `IN-${order.id.slice(-8).toUpperCase()}`; // Generate a linked ID

      await tx.purchaseOrder.create({
        data: {
          id: inboundId,
          type: inboundType,
          status: "Received",
          date: new Date(),
          totalAmount: totalAmount, // 自动填充汇总得出的进货折合金额
          userId: session.id,
          note: `单据由出库退回自动产生。关联出库单: ${order.id}`,
          items: {
            create: itemsToCreate.map((item) => ({
              ...item,
            }))
          }
        }
      });

      // 3. 统一同步物理库存
      if (wasDeducted) {
        for (const item of order.items) {
          await OutboundInventoryService.syncStockFromBatches(
            tx,
            item.productId || null,
            item.shopProductId || null,
            item.productVariantId || null,
            item.shopProductVariantId || null
          );
        }
      }

      // 4. Update the order as "Returned" instead of deleting
      return await tx.outboundOrder.update({
        where: { id },
        data: {
          status: "Returned",
          note: order.note ? `${order.note} (已退回: ${reason})` : `(已退回: ${reason})`
        }
      });
    });

    return NextResponse.json({ success: true, order: result });
  } catch (error) {
    console.error("Failed to return outbound order:", error);
    const message = error instanceof Error ? error.message : "Failed to process return";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
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

    const body = await request.json();
    const { status, notePayload, items } = body;

    const requestedShopProductIds = Array.isArray(items)
      ? items
          .map((item: { shopProductId?: string }) => item.shopProductId)
          .filter((shopProductId: unknown): shopProductId is string => typeof shopProductId === "string" && shopProductId.trim() !== "")
      : [];
    const requestedShopProductVariantIds = Array.isArray(items)
      ? items
          .map((item: { shopProductVariantId?: string }) => item.shopProductVariantId)
          .filter((shopProductVariantId: unknown): shopProductVariantId is string => typeof shopProductVariantId === "string" && shopProductVariantId.trim() !== "")
      : [];

    const shopProducts = requestedShopProductIds.length > 0
      ? await prisma.shopProduct.findMany({
          where: {
            id: { in: requestedShopProductIds },
            shop: { userId: session.id },
          },
          select: {
            id: true,
            productId: true,
          },
        })
      : [];
    const shopProductVariants = requestedShopProductVariantIds.length > 0
      ? await prisma.shopProductVariant.findMany({
          where: {
            id: { in: requestedShopProductVariantIds },
            shopProduct: { shop: { userId: session.id } },
          },
          select: {
            id: true,
            shopProductId: true,
            productVariantId: true,
            sku: true,
            variantName: true,
            shopProduct: {
              select: {
                productId: true,
              },
            },
          },
        })
      : [];
    const shopProductMap = new Map(shopProducts.map((item) => [item.id, item]));
    const shopProductVariantMap = new Map(shopProductVariants.map((item) => [item.id, item]));

    const normalizedItems = Array.isArray(items)
      ? items.map((item: { productId?: string; productVariantId?: string; shopProductId?: string; shopProductVariantId?: string; variantName?: string; variantSku?: string; quantity: number; price?: number }) => {
          const shopProductVariant = item.shopProductVariantId ? shopProductVariantMap.get(item.shopProductVariantId) : null;
          const shopProduct = item.shopProductId ? shopProductMap.get(item.shopProductId) : null;
          return {
            productId: shopProductVariant?.shopProduct.productId || shopProduct?.productId || item.productId || null,
            productVariantId: shopProductVariant?.productVariantId || item.productVariantId || null,
            shopProductId: shopProductVariant?.shopProductId || shopProduct?.id || null,
            shopProductVariantId: shopProductVariant?.id || item.shopProductVariantId || null,
            variantName: shopProductVariant?.variantName || item.variantName || null,
            variantSku: shopProductVariant?.sku || item.variantSku || null,
            quantity: Number(item.quantity) || 0,
            price: item.price || 0,
          };
        }).filter((item) => item.quantity > 0 && (item.productId || item.shopProductId || item.productVariantId || item.shopProductVariantId))
      : null;

    if (Array.isArray(items) && (!normalizedItems || normalizedItems.length === 0)) {
      return NextResponse.json({ error: "请至少保留一件发货商品" }, { status: 400 });
    }

    const updatedOrder = await prisma.$transaction(async (tx) => {
      const existingOrder = await tx.outboundOrder.findFirst({
        where: { id, userId: session.id },
        include: { items: true },
      });

      if (!existingOrder) {
        throw new Error("订单不存在或无权限");
      }

      const isFactoryShipment = existingOrder.type === "FactoryShipment";
      const existingParsedNote = isFactoryShipment ? parseFactoryShipmentNote(existingOrder.note) : null;
      const nextShipmentItems: ShipmentItemIdentity[] = (normalizedItems || existingOrder.items).map((item) => ({
        productId: item.productId || null,
        productVariantId: item.productVariantId || null,
        shopProductId: item.shopProductId || null,
        shopProductVariantId: item.shopProductVariantId || null,
      }));
      const mergedTrackingEntries = notePayload && isFactoryShipment
        ? mergeFactoryShipmentTrackingEntries(
            existingParsedNote?.trackingEntries || [],
            Array.isArray(notePayload.trackingEntries) ? notePayload.trackingEntries : [],
            existingOrder.items,
            nextShipmentItems
          )
        : Array.isArray(notePayload?.trackingEntries)
          ? notePayload.trackingEntries
          : [];

      // 决定最终的发货状态。厂家发货单以合并后的单号记录为准，避免编辑商品时把已发货信息覆盖丢失。
      const finalStatus = isFactoryShipment
        ? deriveFactoryShipmentStatusFromTrackingEntries(
            nextShipmentItems,
            mergedTrackingEntries,
            status !== undefined ? status : existingOrder.status
          )
        : status !== undefined
          ? status
          : existingOrder.status;

      const canKeepShipmentExtras = finalStatus === "已发货" || finalStatus === "部分发货";

      // 只有在发货中/已发货状态下才允许保留补偿状态，否则置空
      let note = undefined;
      if (notePayload) {
        const finalCompensationStatus = canKeepShipmentExtras ? (notePayload.compensationStatus || "") : "";
        const finalLogisticsName = canKeepShipmentExtras ? (notePayload.compensationLogisticsName || "") : "";
        const finalTrackingNumber = canKeepShipmentExtras ? (notePayload.compensationTrackingNumber || "") : "";
        const finalItems = canKeepShipmentExtras ? (notePayload.compensationItems || []) : [];

        note = buildFactoryShipmentNote({
          recipientName: notePayload.recipientName || "",
          recipientPhone: notePayload.recipientPhone || "",
          paymentStatus: notePayload.paymentStatus || "未支付",
          compensationStatus: finalCompensationStatus,
          recipientAddress: notePayload.recipientAddress || "",
          trackingEntries: mergedTrackingEntries,
          remark: notePayload.remark || "",
          compensationLogisticsName: finalLogisticsName,
          compensationTrackingNumber: finalTrackingNumber,
          compensationItems: finalItems,
        });
      }

      if (normalizedItems) {
        const wasDeducted = !isFactoryShipment || existingOrder.status === "已发货" || existingOrder.status === "部分发货";
        const willBeDeducted = !isFactoryShipment || finalStatus === "已发货" || finalStatus === "部分发货";

        if (wasDeducted) {
          for (const item of existingOrder.items) {
            let amountToRestore = item.quantity;
            const batches = await tx.purchaseOrderItem.findMany({
              where: {
                ...(item.shopProductVariantId
                  ? { shopProductVariantId: item.shopProductVariantId }
                  : item.productVariantId
                    ? { productVariantId: item.productVariantId }
                    : item.shopProductId
                      ? { shopProductId: item.shopProductId }
                      : { productId: item.productId }),
                purchaseOrder: {
                  userId: session.id,
                  status: "Received",
                },
              },
              orderBy: {
                purchaseOrder: {
                  date: "desc",
                },
              },
            });

            for (const batch of batches) {
              if (amountToRestore <= 0) break;
              const currentRemaining = batch.remainingQuantity || 0;
              const originalQty = batch.quantity;
              const spaceInBatch = originalQty - currentRemaining;
              const restoreToThisBatch = Math.min(spaceInBatch, amountToRestore);

              if (restoreToThisBatch > 0) {
                await tx.purchaseOrderItem.update({
                  where: { id: batch.id },
                  data: {
                    remainingQuantity: {
                      increment: restoreToThisBatch,
                    },
                  },
                });

                await tx.productBatch.updateMany({
                  where: { purchaseOrderItemId: batch.id },
                  data: {
                    remainingStock: {
                      increment: restoreToThisBatch,
                    },
                  },
                });

                amountToRestore -= restoreToThisBatch;
              }
            }
          }
        }

        await tx.outboundOrderItem.deleteMany({
          where: { outboundOrderId: id },
        });

        await tx.outboundOrderItem.createMany({
          data: normalizedItems.map((item) => ({
            outboundOrderId: id,
            productId: item.productId,
            productVariantId: item.productVariantId,
            shopProductId: item.shopProductId,
            shopProductVariantId: item.shopProductVariantId,
            variantName: item.variantName || null,
            variantSku: item.variantSku || null,
            quantity: item.quantity,
            price: item.price,
          })),
        });

        if (willBeDeducted) {
          await OutboundInventoryService.processOutboundFIFO(
            tx,
            session.id,
            normalizedItems.map((item) => ({
              productId: item.productId,
              productVariantId: item.productVariantId,
              shopProductId: item.shopProductId,
              shopProductVariantId: item.shopProductVariantId,
              quantity: item.quantity,
            }))
          );
        }

        const touchedItems = [
          ...existingOrder.items.map((item) => ({
            productId: item.productId,
            productVariantId: item.productVariantId,
            shopProductId: item.shopProductId,
            shopProductVariantId: item.shopProductVariantId,
          })),
          ...normalizedItems.map((item) => ({
            productId: item.productId,
            productVariantId: item.productVariantId,
            shopProductId: item.shopProductId,
            shopProductVariantId: item.shopProductVariantId,
          })),
        ];

        for (const item of touchedItems) {
          await OutboundInventoryService.syncStockFromBatches(
            tx,
            item.productId || null,
            item.shopProductId || null,
            item.productVariantId || null,
            item.shopProductVariantId || null
          );
        }
      }

      if (notePayload) {
        try {
          const wasShipped = existingOrder.status === "已发货" || existingOrder.status === "部分发货";
          const willBeShipped = finalStatus === "已发货" || finalStatus === "部分发货";
          const isShipped = !wasShipped && willBeShipped;
          await collectFactoryShipmentCustomer(tx, session.id, {
            recipientName: notePayload.recipientName,
            recipientPhone: notePayload.recipientPhone,
            recipientAddress: notePayload.recipientAddress,
          }, isShipped);
        } catch (err) {
          console.error("Failed to auto-collect customer during outbound update:", err);
        }
      }

      return await tx.outboundOrder.update({
        where: { id },
        data: {
          status: finalStatus,
          ...(note !== undefined && { note }),
        },
      });
    });

    return NextResponse.json({ success: true, order: updatedOrder });
  } catch (error) {
    console.error("Failed to update outbound order:", error);
    const message = error instanceof Error ? error.message : "Failed to update";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE remains but only for very specific cleaning (optional, maybe disable)
export async function DELETE() {
  // 业务上不再推荐直接删除，返回一个提醒或者依然执行删除
  return NextResponse.json({ error: "Please use POST /api/outbound/[id]/return instead of DELETE for audit trace." }, { status: 405 });
}
