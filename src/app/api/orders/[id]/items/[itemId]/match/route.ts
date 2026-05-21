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
  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    sku: String(record.sku || "").trim() || null,
    image: String(record.image || "").trim() || null,
    sourceType: record.sourceType === "shopProduct" ? "shopProduct" as const : "product" as const,
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

    const product = await prisma.product.findFirst({
      where: user.role === "SUPER_ADMIN"
        ? { id: productId }
        : {
            id: productId,
            userId: user.id,
          },
      select: {
        id: true,
        name: true,
        sku: true,
        image: true,
      },
    });

    if (!product) {
      return NextResponse.json({ error: "商品不存在或无权使用" }, { status: 404 });
    }

    const storage = await getStorageStrategy();
    const matchedProduct = {
      id: product.id,
      name: product.name || "未命名商品",
      sku: product.sku || null,
      image: product.image ? storage.resolveUrl(product.image) : null,
      sourceType: "product" as const,
      shopName: null,
      isManual: true,
    };

    if (autoMatchedProduct?.id && autoMatchedProduct.id === matchedProduct.id) {
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
