import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { getStorageStrategy } from "@/lib/storage";
import { Prisma } from "../../../../../../../../prisma/generated-client";
import {
  syncAutoOutboundFromCompletedAutoPickOrder,
  syncJdSkuIdForShopProduct,
  syncMeituanSkuIdForShopProduct,
  syncTaobaoSkuIdForShopProduct,
  unbindJdSkuIdForShopProduct,
  unbindMeituanSkuIdForShopProduct,
  unbindTaobaoSkuIdForShopProduct,
} from "@/lib/autoPickOrders";

function readRawPayloadRecord(rawPayload: unknown) {
  return rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
    ? (rawPayload as Record<string, unknown>)
    : {};
}

function extractShopProductIdsFromCandidate(candidate: unknown): string[] {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
  const record = candidate as Record<string, unknown>;
  const ids: string[] = [];
  const rawId = String(record.id || "").trim();
  const rawShopProductId = String(record.shopProductId || "").trim();
  if (rawShopProductId && rawShopProductId !== "__ignored__") ids.push(rawShopProductId);
  if (rawId && rawId !== "__ignored__") ids.push(rawId);

  if (Array.isArray(record.bundleItems)) {
    for (const item of record.bundleItems) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const b = item as Record<string, unknown>;
        if (b.shopProductId) ids.push(String(b.shopProductId).trim());
        if (b.id) ids.push(String(b.id).trim());
      }
    }
  }

  return Array.from(new Set(ids.flatMap((id) => id.split(/[+＋]/)).map((s) => s.trim()).filter(Boolean)));
}

function normalizeMatchedProductCandidate(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const record = input as Record<string, unknown>;
  const id = String(record.id || "").trim();
  const name = String(record.name || "").trim();
  const sourceType = record.sourceType === "shopProduct" ? ("shopProduct" as const) : ("product" as const);
  const shopProductId = String(record.shopProductId || "").trim() || null;
  if (!id || !name || sourceType !== "shopProduct" || !shopProductId) {
    return null;
  }

  return {
    id,
    name,
    sku: String(record.sku || "").trim() || null,
    image: String(record.image || "").trim() || null,
    sourceType,
    shopProductId,
    shopName: String(record.shopName || "").trim() || null,
    bundleItems: Array.isArray(record.bundleItems) ? record.bundleItems : undefined,
  };
}

function readAutoMatchedProductSnapshot(rawPayload: unknown) {
  const record = readRawPayloadRecord(rawPayload);
  const manualMatchedProduct = record.manualMatchedProduct;
  if (!manualMatchedProduct || typeof manualMatchedProduct !== "object" || Array.isArray(manualMatchedProduct)) {
    return null;
  }

  return normalizeMatchedProductCandidate(
    (manualMatchedProduct as Record<string, unknown>).autoMatchedProduct
  );
}

function readRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readMeituanSkuId(rawPayload: Record<string, unknown>) {
  const goodsExtra = rawPayload.goods_extra || rawPayload.goodsExtra;
  const parsedGoodsExtra =
    typeof goodsExtra === "string"
      ? (() => {
          try {
            return JSON.parse(goodsExtra) as Record<string, unknown>;
          } catch {
            return {};
          }
        })()
      : readRecord(goodsExtra);

  return String(
    parsedGoodsExtra.original_sku_id ||
      rawPayload.source_id ||
      rawPayload.sourceId ||
      ""
  ).trim();
}

function readJdSkuId(rawPayload: Record<string, unknown>) {
  return String(
    rawPayload.source_id ||
      rawPayload.sourceId ||
      rawPayload.sku_code ||
      rawPayload.skuCode ||
      ""
  ).trim();
}

function readTaobaoSkuId(rawPayload: Record<string, unknown>) {
  return String(
    rawPayload.sku_id ||
      rawPayload.skuId ||
      rawPayload.source_id ||
      rawPayload.sourceId ||
      ""
  ).trim();
}

function readOrderItemPlatformSkuId(
  platform: string | null | undefined,
  platformSkuId: string | null | undefined,
  rawPayload: Record<string, unknown>,
  fallbackRawPayload?: Record<string, unknown>
) {
  const normalizedPlatformSkuId = String(platformSkuId || "").trim();
  if (normalizedPlatformSkuId) {
    return normalizedPlatformSkuId;
  }

  if (isMeituanPlatform(platform)) {
    return (
      readMeituanSkuId(rawPayload) ||
      (fallbackRawPayload ? readMeituanSkuId(fallbackRawPayload) : "")
    );
  }

  if (isJDPlatform(platform)) {
    return readJdSkuId(rawPayload) || (fallbackRawPayload ? readJdSkuId(fallbackRawPayload) : "");
  }

  if (isTaobaoPlatform(platform)) {
    return readTaobaoSkuId(rawPayload) || (fallbackRawPayload ? readTaobaoSkuId(fallbackRawPayload) : "");
  }

  return "";
}

function isMeituanPlatform(platform: string | null | undefined) {
  const normalized = String(platform || "").trim().toLowerCase();
  return (
    normalized.includes("meituan") ||
    normalized.includes("美团") ||
    normalized.includes("闪购") ||
    normalized.includes("shangou")
  );
}

function isJDPlatform(platform: string | null | undefined) {
  const normalized = String(platform || "").trim().toLowerCase();
  return normalized.includes("jd") || normalized.includes("jingdong") || normalized.includes("京东");
}

function isTaobaoPlatform(platform: string | null | undefined) {
  const normalized = String(platform || "").trim().toLowerCase();
  return normalized.includes("taobao") || normalized.includes("淘宝") || normalized.includes("天猫");
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function normalizeComparable(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function findOrderRawPayloadItemPayload(
  orderRawPayload: unknown,
  item: {
    productNo?: string | null;
    rawPayload?: unknown;
  }
) {
  const itemPayload = readRawPayloadRecord(item.rawPayload);
  const orderPayload = readRawPayloadRecord(orderRawPayload);
  const goods = [
    ...readArray(orderPayload.goods),
    ...readArray(orderPayload.items),
    ...readArray(readRecord(orderPayload.data).goods),
    ...readArray(readRecord(orderPayload.data).items),
  ];
  const itemProductNo = normalizeComparable(item.productNo);
  const itemName = normalizeComparable(itemPayload.productName || itemPayload.goods_name);

  for (const rawGoods of goods) {
    const goodsRecord = readRecord(rawGoods);
    const goodsProductNo = normalizeComparable(
      goodsRecord.productNo ||
        goodsRecord.source_id ||
        goodsRecord.sourceId ||
        goodsRecord.sku_code ||
        goodsRecord.skuCode
    );
    const goodsName = normalizeComparable(goodsRecord.productName || goodsRecord.goods_name);
    if (
      (itemProductNo && goodsProductNo && itemProductNo === goodsProductNo) ||
      (itemName && goodsName && itemName === goodsName)
    ) {
      return goodsRecord;
    }
  }

  return {};
}

async function syncMeituanIdForMatchedShopProduct(
  tx: Prisma.TransactionClient,
  userId: string,
  shopProduct: {
    id: string;
    productName: string | null;
  },
  rawPayload: Record<string, unknown>,
  fallbackRawPayload?: Record<string, unknown>,
  platform?: string | null,
  productNo?: string | null,
  platformSkuId?: string | null
) {
  if (!isMeituanPlatform(platform)) {
    return;
  }

  const meituanId = readOrderItemPlatformSkuId(platform, platformSkuId, rawPayload, fallbackRawPayload);
  if (!meituanId) {
    return;
  }

  await syncMeituanSkuIdForShopProduct(tx, userId, shopProduct.id, meituanId);
}

async function syncPlatformIdForMatchedShopProduct(
  tx: Prisma.TransactionClient,
  userId: string,
  shopProductId: string,
  platform: string | null | undefined,
  sourceId: string
) {
  if (!sourceId || !shopProductId) return;
  if (isMeituanPlatform(platform)) {
    await syncMeituanSkuIdForShopProduct(tx, userId, shopProductId, sourceId);
  } else if (isJDPlatform(platform)) {
    await syncJdSkuIdForShopProduct(tx, userId, shopProductId, sourceId);
  } else if (isTaobaoPlatform(platform)) {
    await syncTaobaoSkuIdForShopProduct(tx, userId, shopProductId, sourceId);
  }
}

async function unbindPlatformIdForShopProduct(
  tx: Prisma.TransactionClient,
  userId: string,
  shopProductId: string,
  platform: string | null | undefined,
  sourceId: string
) {
  if (!sourceId || !shopProductId) return;
  if (isMeituanPlatform(platform)) {
    await unbindMeituanSkuIdForShopProduct(tx, userId, shopProductId, sourceId);
  } else if (isJDPlatform(platform)) {
    await unbindJdSkuIdForShopProduct(tx, userId, shopProductId, sourceId);
  } else if (isTaobaoPlatform(platform)) {
    await unbindTaobaoSkuIdForShopProduct(tx, userId, shopProductId, sourceId);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const user = await getAuthorizedUser("order:manage");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, itemId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const shouldClear = Boolean(body?.clear);
    const deferAutoOutbound = body?.deferAutoOutbound === true;
    const productId = String(body?.productId || "").trim();

    if (!shouldClear && !productId) {
      return NextResponse.json({ error: "请选择要匹配的商品" }, { status: 400 });
    }

    const isAdmin = Boolean(
      user.role === "SUPER_ADMIN" ||
        (user.role && String(user.role).includes("管理")) ||
        (Array.isArray(user.permissions) &&
          (user.permissions.includes("*") ||
            user.permissions.includes("members:manage") ||
            user.permissions.includes("admin")))
    );

    const orderItem = await prisma.autoPickOrderItem.findFirst({
      where: {
        id: itemId,
        orderId: id,
        ...(isAdmin ? {} : { order: { userId: user.id } }),
      },
      select: {
        id: true,
        productNo: true,
        platformSkuId: true,
        rawPayload: true,
        order: {
          select: {
            orderNo: true,
            platform: true,
            rawPayload: true,
            userId: true,
          },
        },
      },
    });

    if (!orderItem) {
      return NextResponse.json({ error: "订单商品不存在" }, { status: 404 });
    }

    const targetUserId = orderItem.order.userId || user.id;

    const deleteLegacyOutbound = async (tx: any, orderNo: string) => {
      const existingOutbounds = await tx.outboundOrder.findMany({
        where: {
          userId: targetUserId,
          note: {
            contains: `平台单号: ${orderNo}`,
            mode: "insensitive",
          },
        },
        select: { id: true, note: true },
      });

      const filteredOutbounds = existingOutbounds.filter((outbound: any) => {
        const match = outbound.note?.match(/平台单号:\s*([^\s|]+)/);
        if (!match) return false;
        return match[1].toLowerCase() === orderNo.toLowerCase();
      });

      if (filteredOutbounds.length > 0) {
        await tx.outboundOrder.deleteMany({
          where: {
            id: { in: filteredOutbounds.map((o: any) => o.id) },
          },
        });
      }
    };
    const basePayload = readRawPayloadRecord(orderItem.rawPayload);
    const fallbackItemPayload = findOrderRawPayloadItemPayload(orderItem.order.rawPayload, orderItem);
    const {
      manualMatchedProduct: _removedManualMatchedProduct,
      ignoreOutbound: _removedIgnoreOutbound,
      isManualIgnored: _removedIsManualIgnored,
      pauseAutoOutbound: _removedPauseAutoOutbound,
      ...restPayload
    } = basePayload;
    const previousAutoMatchedProduct = readAutoMatchedProductSnapshot(orderItem.rawPayload);
    const requestedAutoMatchedProduct = normalizeMatchedProductCandidate(body?.autoMatchedProduct);
    const autoMatchedProduct = previousAutoMatchedProduct || requestedAutoMatchedProduct;

    const previousShopProductIds = Array.from(new Set([
      ...extractShopProductIdsFromCandidate(basePayload.manualMatchedProduct),
      ...extractShopProductIdsFromCandidate(autoMatchedProduct),
    ]));

    const currentPlatformSkuId = readOrderItemPlatformSkuId(orderItem.order.platform, orderItem.platformSkuId, basePayload, fallbackItemPayload);

    if (shouldClear) {
      const nextPayload = {
        ...restPayload,
        ignoreOutbound: true,
        isManualIgnored: true,
      };

      await prisma.$transaction(async (tx) => {
        await tx.autoPickOrderItem.update({
          where: { id: orderItem.id },
          data: {
            rawPayload: (Object.keys(nextPayload).length > 0 ? nextPayload : Prisma.JsonNull) as Prisma.InputJsonValue,
          },
        });
        if (!deferAutoOutbound) {
          await deleteLegacyOutbound(tx, orderItem.order.orderNo);
        }
      });

      if (currentPlatformSkuId && previousShopProductIds.length > 0) {
        for (const oldShopProductId of previousShopProductIds) {
          await unbindPlatformIdForShopProduct(prisma, targetUserId, oldShopProductId, orderItem.order.platform, currentPlatformSkuId).catch(() => null);
        }
      }

      await syncAutoOutboundFromCompletedAutoPickOrder(targetUserId, id).catch(() => null);

      return NextResponse.json({
        ok: true,
        matchedProduct: {
          id: "__ignored__",
          name: "无需出库（纯取货/跑腿）",
          sku: "-",
          image: null,
          sourceType: "product",
          shopProductId: "",
          isManual: true,
          ignoreOutbound: true,
        },
      });
    }

    const storage = await getStorageStrategy();
    const productIds = productId.split(/[+＋]/).map((item) => item.trim()).filter(Boolean);

    const rawItems: Array<{ id: string; quantity?: number }> = Array.isArray(body?.items) ? body.items : [];
    const itemsQtyMap = new Map<string, number>();
    for (const item of rawItems) {
      if (item && item.id) {
        itemsQtyMap.set(String(item.id).trim(), Math.max(1, Number(item.quantity || 1) || 1));
      }
    }

    if (productIds.length > 1) {
      const shopProducts = await prisma.shopProduct.findMany({
        where: {
          id: { in: productIds },
          shop: { userId: targetUserId },
        },
        select: {
          id: true,
          productName: true,
          sku: true,
          productImage: true,
          product: {
            select: {
              image: true,
            },
          },
          shop: {
            select: {
              name: true,
            },
          },
        },
      });

      if (shopProducts.length === 0) {
        return NextResponse.json({ error: "未找到对应的店铺商品" }, { status: 404 });
      }

      const firstImage = shopProducts[0]?.productImage || shopProducts[0]?.product?.image || null;
      const matchedProduct = {
        id: shopProducts.map((p) => p.id).join("+"),
        name: shopProducts
          .map((p) => {
            const qty = itemsQtyMap.get(p.id);
            return qty && qty > 1 ? `${p.productName || "未命名商品"} x${qty}` : (p.productName || "未命名商品");
          })
          .join(" + "),
        sku: shopProducts.map((p) => p.sku || "").join(" + "),
        image: firstImage ? storage.resolveUrl(firstImage) : null,
        sourceType: "shopProduct" as const,
        shopProductId: shopProducts.map((p) => p.id).join("+"),
        shopName: shopProducts[0]?.shop?.name || null,
        isManual: true,
        bundleItems: shopProducts.map((p) => {
          const rawItemImg = p.productImage || p.product?.image || null;
          return {
            id: p.id,
            name: p.productName || "未命名商品",
            sku: p.sku || null,
            image: rawItemImg ? storage.resolveUrl(rawItemImg) : null,
            sourceType: "shopProduct" as const,
            shopProductId: p.id,
            shopName: p.shop?.name || null,
            quantity: itemsQtyMap.get(p.id) || 1,
          };
        }),
      };

      await prisma.$transaction(async (tx) => {
        await tx.autoPickOrderItem.update({
          where: { id: orderItem.id },
          data: {
            rawPayload: {
              ...restPayload,
              manualMatchedProduct: matchedProduct,
            } as Prisma.InputJsonValue,
          },
        });
        await deleteLegacyOutbound(tx, orderItem.order.orderNo);
      });

      const newShopProductIds = new Set(shopProducts.map((p) => p.id));
      if (currentPlatformSkuId && previousShopProductIds.length > 0) {
        const unbindOldIds = previousShopProductIds.filter((oldId) => !newShopProductIds.has(oldId));
        for (const oldShopProductId of unbindOldIds) {
          await unbindPlatformIdForShopProduct(prisma, targetUserId, oldShopProductId, orderItem.order.platform, currentPlatformSkuId).catch(() => null);
        }
      }

      // 组合匹配只是把一个平台订单项拆成多个本地出库商品。
      // 平台 SKU 仍然只代表原始订单项，不能写到组合里的每个商品上，否则会把无关商品标成“已占用”。

      if (!deferAutoOutbound) {
        await syncAutoOutboundFromCompletedAutoPickOrder(targetUserId, id).catch((error) => {
          console.error("Failed to auto-create outbound after manual product match:", error);
        });
      }

      return NextResponse.json({ ok: true, matchedProduct });
    }

    const shopProduct = await prisma.shopProduct.findFirst({
      where: {
        id: productId,
        shop: { userId: targetUserId },
      },
      select: {
        id: true,
        productId: true,
        sourceProductId: true,
        jdSkuId: true,
        productName: true,
        sku: true,
        productImage: true,
        categoryId: true,
        categoryName: true,
        supplierId: true,
        costPrice: true,
        product: {
          select: {
            image: true,
          },
        },
        shop: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!shopProduct) {
      return NextResponse.json({ error: "只能匹配当前店铺商品，模板库商品不参与订单匹配" }, { status: 404 });
    }

    const singleQty = itemsQtyMap.get(shopProduct.id) || (body?.quantity ? Number(body.quantity) : undefined);
    const rawSingleImage = shopProduct.productImage || shopProduct.product?.image || null;
    const matchedProduct = {
      id: shopProduct.id,
      name: shopProduct.productName || "未命名商品",
      sku: shopProduct.sku || null,
      image: rawSingleImage ? storage.resolveUrl(rawSingleImage) : null,
      sourceType: "shopProduct" as const,
      shopProductId: shopProduct.id,
      shopName: shopProduct.shop?.name || null,
      isManual: true,
      ...(singleQty && singleQty > 0 ? { quantity: singleQty } : {}),
    };

    if (autoMatchedProduct?.shopProductId && autoMatchedProduct.shopProductId === matchedProduct.shopProductId) {
      await prisma.$transaction(async (tx) => {
        await tx.autoPickOrderItem.update({
          where: { id: orderItem.id },
          data: {
            rawPayload: (Object.keys(restPayload).length > 0 ? restPayload : Prisma.JsonNull) as Prisma.InputJsonValue,
          },
        });
        await deleteLegacyOutbound(tx, orderItem.order.orderNo);
      });

      const isCompositeItemSku = /[+＋]/.test(String(orderItem.productNo || ""));
      if (!isCompositeItemSku) {
        await syncPlatformIdForMatchedShopProduct(
          prisma,
          targetUserId,
          shopProduct.id,
          orderItem.order.platform,
          currentPlatformSkuId
        ).catch(() => null);
      }

      return NextResponse.json({
        ok: true,
        matchedProduct: {
          ...autoMatchedProduct,
          isManual: false,
        },
      });
    }

    await prisma.$transaction(async (tx) => {
      const targetJdSkuId = String(
        orderItem.productNo ||
          basePayload.source_id ||
          basePayload.sourceId ||
          basePayload.sku_code ||
          basePayload.skuCode ||
          ""
      ).trim();

      if (targetJdSkuId && !orderItem.productNo) {
        await tx.autoPickOrderItem.update({
          where: { id: orderItem.id },
          data: { productNo: targetJdSkuId },
        });
      }

      await tx.autoPickOrderItem.update({
        where: { id: orderItem.id },
        data: {
          rawPayload: {
            ...restPayload,
            ...(deferAutoOutbound ? { ignoreOutbound: true, pauseAutoOutbound: true } : {}),
            manualMatchedProduct: {
              id: matchedProduct.id,
              name: matchedProduct.name,
              sku: matchedProduct.sku,
              image: matchedProduct.image,
              sourceType: matchedProduct.sourceType,
              shopProductId: matchedProduct.shopProductId,
              shopName: matchedProduct.shopName,
              ...(singleQty && singleQty > 0 ? { quantity: singleQty } : {}),
              ...(deferAutoOutbound ? { pendingOutboundMatch: true } : {}),
              ...(autoMatchedProduct ? { autoMatchedProduct } : {}),
            },
          } as Prisma.InputJsonValue,
        },
      });
      if (!deferAutoOutbound) {
        await deleteLegacyOutbound(tx, orderItem.order.orderNo);
      }
    });

    if (currentPlatformSkuId && previousShopProductIds.length > 0) {
      const unbindOldIds = previousShopProductIds.filter((oldId) => oldId !== shopProduct.id);
      for (const oldShopProductId of unbindOldIds) {
        await unbindPlatformIdForShopProduct(prisma, targetUserId, oldShopProductId, orderItem.order.platform, currentPlatformSkuId).catch(() => null);
      }
    }

    const isCompositeItemSku = /[+＋]/.test(String(orderItem.productNo || ""));
    if (!isCompositeItemSku) {
      await syncPlatformIdForMatchedShopProduct(
        prisma,
        targetUserId,
        shopProduct.id,
        orderItem.order.platform,
        currentPlatformSkuId
      ).catch(() => null);
    }

    if (!deferAutoOutbound) {
      await syncAutoOutboundFromCompletedAutoPickOrder(targetUserId, id).catch((error) => {
        console.error("Failed to auto-create outbound after manual product match:", error);
      });
    }

    return NextResponse.json({
      ok: true,
      matchedProduct: {
        ...matchedProduct,
        ...(deferAutoOutbound ? { pendingOutboundMatch: true } : {}),
      },
    });
  } catch (error) {
    console.error("Failed to patch auto-pick order item match:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "更新商品匹配失败",
      },
      { status: 500 }
    );
  }
}
