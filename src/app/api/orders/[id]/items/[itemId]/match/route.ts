import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { getStorageStrategy } from "@/lib/storage";
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
        rawPayload: true,
      },
    });

    if (!orderItem) {
      return NextResponse.json({ error: "订单商品不存在" }, { status: 404 });
    }

    const basePayload = readRawPayloadRecord(orderItem.rawPayload);
    const { manualMatchedProduct: _removedManualMatchedProduct, ...restPayload } = basePayload;
    const previousAutoMatchedProduct = readAutoMatchedProductSnapshot(orderItem.rawPayload);
    const requestedAutoMatchedProduct = normalizeMatchedProductCandidate(body?.autoMatchedProduct);
    const autoMatchedProduct = previousAutoMatchedProduct || requestedAutoMatchedProduct;

    if (shouldClear) {
      await prisma.autoPickOrderItem.update({
        where: { id: orderItem.id },
        data: {
          rawPayload: (Object.keys(restPayload).length > 0 ? restPayload : Prisma.JsonNull) as Prisma.InputJsonValue,
        },
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
    const shopProduct = await prisma.shopProduct.findFirst({
      where: {
        id: productId,
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
      await prisma.autoPickOrderItem.update({
        where: { id: orderItem.id },
        data: {
          rawPayload: (Object.keys(restPayload).length > 0 ? restPayload : Prisma.JsonNull) as Prisma.InputJsonValue,
        },
      });

      return NextResponse.json({
        ok: true,
        matchedProduct: {
          ...autoMatchedProduct,
          isManual: false,
        },
      });
    }

    await prisma.autoPickOrderItem.update({
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

    return NextResponse.json({ ok: true, matchedProduct });
  } catch (error) {
    console.error("Failed to patch auto-pick order item match:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "更新商品匹配失败",
    }, { status: 500 });
  }
}
