import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { getStorageStrategy } from "@/lib/storage";
import { normalizeJdSkuIds, replaceProductJdSkuMappings } from "@/lib/productJdSku";
import { Prisma } from "../../../../../../../../prisma/generated-client";
import { syncAutoOutboundFromCompletedAutoPickOrder } from "@/lib/autoPickOrders";

function readRawPayloadRecord(rawPayload: unknown) {
  return rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
    ? rawPayload as Record<string, unknown>
    : {};
}

function normalizeMatchedProductCandidate(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const record = input as Record<string, unknown>;
  const id = String(record.id || "").trim();
  const name = String(record.name || "").trim();
  const sourceType = record.sourceType === "shopProduct" ? "shopProduct" as const : "product" as const;
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
    ? value as Record<string, unknown>
    : {};
}

function readMeituanOriginalSpuId(rawPayload: Record<string, unknown>) {
  const goodsExtra = rawPayload.goods_extra || rawPayload.goodsExtra;
  const parsedGoodsExtra = typeof goodsExtra === "string"
    ? (() => {
        try {
          return JSON.parse(goodsExtra) as Record<string, unknown>;
        } catch {
          return {};
        }
      })()
    : readRecord(goodsExtra);

  return String(
    parsedGoodsExtra.original_spu_id
    || parsedGoodsExtra.originalSpuId
    || rawPayload.original_spu_id
    || rawPayload.originalSpuId
    || ""
  ).trim();
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
  },
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
      goodsRecord.productNo
      || goodsRecord.source_id
      || goodsRecord.sourceId
      || goodsRecord.sku_code
      || goodsRecord.skuCode
    );
    const goodsName = normalizeComparable(goodsRecord.productName || goodsRecord.goods_name);
    if ((itemProductNo && goodsProductNo && itemProductNo === goodsProductNo)
      || (itemName && goodsName && itemName === goodsName)) {
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
) {
  const meituanId = readMeituanOriginalSpuId(rawPayload) || (fallbackRawPayload ? readMeituanOriginalSpuId(fallbackRawPayload) : "");
  if (!meituanId) {
    return;
  }

  try {
    const existing = await tx.shopProduct.findFirst({
      where: {
        shop: { userId },
        meituanSkuId: meituanId,
        id: { not: shopProduct.id },
      },
    });
    if (existing) {
      return;
    }
    await tx.shopProduct.update({
      where: { id: shopProduct.id },
      data: { meituanSkuId: meituanId },
    });
  } catch (error) {
    console.warn("[match/route] 忽略冲突的 meituanId 回填:", error);
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
    const productId = String(body?.productId || "").trim();

    if (!shouldClear && !productId) {
      return NextResponse.json({ error: "请选择要匹配的商品" }, { status: 400 });
    }

    const orderItem = await prisma.autoPickOrderItem.findFirst({
      where: {
        id: itemId,
        orderId: id,
        order: { userId: user.id },
      },
      select: {
        id: true,
        productNo: true,
        rawPayload: true,
        order: {
          select: {
            orderNo: true,
            platform: true,
            rawPayload: true,
          },
        },
      },
    });

    if (!orderItem) {
      return NextResponse.json({ error: "订单商品不存在" }, { status: 404 });
    }

    const deleteLegacyOutbound = async (tx: any, orderNo: string) => {
      const existingOutbounds = await tx.outboundOrder.findMany({
        where: {
          userId: user.id,
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
    const { manualMatchedProduct: _removedManualMatchedProduct, ...restPayload } = basePayload;
    const previousAutoMatchedProduct = readAutoMatchedProductSnapshot(orderItem.rawPayload);
    const requestedAutoMatchedProduct = normalizeMatchedProductCandidate(body?.autoMatchedProduct);
    const autoMatchedProduct = previousAutoMatchedProduct || requestedAutoMatchedProduct;

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
        await deleteLegacyOutbound(tx, orderItem.order.orderNo);
      });

      await syncAutoOutboundFromCompletedAutoPickOrder(user.id, id).catch(() => null);

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
    const productIds = productId.split(/[+＋]/).map(item => item.trim()).filter(Boolean);

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
          shop: { userId: user.id },
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
        name: shopProducts.map((p) => {
          const qty = itemsQtyMap.get(p.id);
          return qty && qty > 1 ? `${p.productName || "未命名商品"} x${qty}` : (p.productName || "未命名商品");
        }).join(" + "),
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

      await syncAutoOutboundFromCompletedAutoPickOrder(user.id, id).catch((error) => {
        console.error("Failed to auto-create outbound after manual product match:", error);
      });

      return NextResponse.json({ ok: true, matchedProduct });
    }

    const shopProduct = await prisma.shopProduct.findFirst({
      where: {
        id: productId,
        shop: { userId: user.id },
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
        await syncMeituanIdForMatchedShopProduct(tx, user.id, shopProduct, basePayload, fallbackItemPayload);
        await tx.autoPickOrderItem.update({
          where: { id: orderItem.id },
          data: {
            rawPayload: (Object.keys(restPayload).length > 0 ? restPayload : Prisma.JsonNull) as Prisma.InputJsonValue,
          },
        });
        await deleteLegacyOutbound(tx, orderItem.order.orderNo);
      });

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
        orderItem.productNo
        || basePayload.source_id
        || basePayload.sourceId
        || basePayload.sku_code
        || basePayload.skuCode
        || ""
      ).trim();

      const platformStr = String(orderItem.order?.platform || "");
      const isJdOrder = platformStr.includes("京东") ||
        platformStr.toLowerCase().includes("daojia") ||
        platformStr.toLowerCase().includes("jd");

      if (isJdOrder && targetJdSkuId) {
        try {
          const existingJdSkuIds = normalizeJdSkuIds(shopProduct.jdSkuId);
          const nextJdSkuIds = Array.from(new Set([...existingJdSkuIds, targetJdSkuId]));
          const primaryJdSkuIdStr = nextJdSkuIds.join(",");

          await tx.shopProduct.update({
            where: { id: shopProduct.id },
            data: { jdSkuId: primaryJdSkuIdStr },
          });

          if (shopProduct.productId) {
            const existingProductJdSkus = await tx.productJdSku.findMany({
              where: { productId: shopProduct.productId },
              select: { jdSkuId: true },
            });
            const productJdSkuIds = Array.from(new Set([
              ...existingProductJdSkus.map((item) => item.jdSkuId),
              ...nextJdSkuIds,
            ]));

            await replaceProductJdSkuMappings(tx, shopProduct.productId, user.id, productJdSkuIds);
            await tx.product.update({
              where: { id: shopProduct.productId },
              data: { jdSkuId: productJdSkuIds[0] || null },
            });
          }
        } catch (error) {
          console.warn("[match/route] 忽略冲突的 jdSkuId 更新:", error);
        }

        if (!orderItem.productNo) {
          await tx.autoPickOrderItem.update({
            where: { id: orderItem.id },
            data: { productNo: targetJdSkuId },
          });
        }
      }

      await syncMeituanIdForMatchedShopProduct(tx, user.id, shopProduct, basePayload, fallbackItemPayload);

      await tx.autoPickOrderItem.update({
        where: { id: orderItem.id },
        data: {
          rawPayload: {
            ...restPayload,
            manualMatchedProduct: {
              id: matchedProduct.id,
              name: matchedProduct.name,
              sku: matchedProduct.sku,
              image: matchedProduct.image,
              sourceType: matchedProduct.sourceType,
              shopProductId: matchedProduct.shopProductId,
              shopName: matchedProduct.shopName,
              ...(autoMatchedProduct ? { autoMatchedProduct } : {}),
            },
          } as Prisma.InputJsonValue,
        },
      });
      await deleteLegacyOutbound(tx, orderItem.order.orderNo);
    });

    await syncAutoOutboundFromCompletedAutoPickOrder(user.id, id).catch((error) => {
      console.error("Failed to auto-create outbound after manual product match:", error);
    });

    return NextResponse.json({ ok: true, matchedProduct });
  } catch (error) {
    console.error("Failed to patch auto-pick order item match:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "更新商品匹配失败",
    }, { status: 500 });
  }
}
