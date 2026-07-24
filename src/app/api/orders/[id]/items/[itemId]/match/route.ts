import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { getStorageStrategy } from "@/lib/storage";
import { normalizeJdSkuIds, replaceProductJdSkuMappings } from "@/lib/productJdSku";
import { Prisma } from "../../../../../../../../prisma/generated-client";

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
    const { manualMatchedProduct: _removedManualMatchedProduct, ...restPayload } = basePayload;
    const previousAutoMatchedProduct = readAutoMatchedProductSnapshot(orderItem.rawPayload);
    const requestedAutoMatchedProduct = normalizeMatchedProductCandidate(body?.autoMatchedProduct);
    const autoMatchedProduct = previousAutoMatchedProduct || requestedAutoMatchedProduct;

    if (shouldClear) {
      await prisma.$transaction(async (tx) => {
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
        matchedProduct: autoMatchedProduct ? {
          ...autoMatchedProduct,
          isManual: false,
        } : null,
      });
    }

    const storage = await getStorageStrategy();
    const productIds = productId.split(/[+＋]/).map(item => item.trim()).filter(Boolean);

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

      const matchedProduct = {
        id: shopProducts.map((p) => p.id).join("+"),
        name: shopProducts.map((p) => p.productName || "未命名商品").join(" + "),
        sku: shopProducts.map((p) => p.sku || "").join(" + "),
        image: shopProducts[0]?.productImage ? storage.resolveUrl(shopProducts[0].productImage) : null,
        sourceType: "shopProduct" as const,
        shopProductId: shopProducts.map((p) => p.id).join("+"),
        shopName: shopProducts[0]?.shop?.name || null,
        isManual: true,
        bundleItems: shopProducts.map((p) => ({
          id: p.id,
          name: p.productName || "未命名商品",
          sku: p.sku || null,
          image: p.productImage ? storage.resolveUrl(p.productImage) : null,
          sourceType: "shopProduct" as const,
          shopProductId: p.id,
          shopName: p.shop?.name || null,
        })),
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
        jdSkuId: true,
        productName: true,
        sku: true,
        productImage: true,
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

    const matchedProduct = {
      id: shopProduct.id,
      name: shopProduct.productName || "未命名商品",
      sku: shopProduct.sku || null,
      image: shopProduct.productImage ? storage.resolveUrl(shopProduct.productImage) : null,
      sourceType: "shopProduct" as const,
      shopProductId: shopProduct.id,
      shopName: shopProduct.shop?.name || null,
      isManual: true,
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

      if (targetJdSkuId) {
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

        if (!orderItem.productNo) {
          await tx.autoPickOrderItem.update({
            where: { id: orderItem.id },
            data: { productNo: targetJdSkuId },
          });
        }
      }

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

    return NextResponse.json({ ok: true, matchedProduct });
  } catch (error) {
    console.error("Failed to patch auto-pick order item match:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "更新商品匹配失败",
    }, { status: 500 });
  }
}
