import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/catalogPrisma";
import { getAuthorizedUser } from "@/lib/auth";
import { normalizeMeituanSkuIds, replaceProductMeituanSkuMappings } from "@/lib/productMeituanSku";

const PLATFORM_FIELD = {
  jd: "jdSkuId",
  meituan: "meituanSkuId",
  taobao: "taobaoSkuId",
  doudian: "doudianSkuId",
} as const;

type PlatformKey = keyof typeof PLATFORM_FIELD;

function normalizePlatformId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthorizedUser("product:update");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const platform = String(body?.platform || "").trim() as PlatformKey;
    const field = PLATFORM_FIELD[platform];

    if (!field) {
      return NextResponse.json({ error: "不支持的平台类型" }, { status: 400 });
    }

    const existing = await prisma.shopProduct.findFirst({
      where: {
        id,
        ...(user.role === "SUPER_ADMIN" ? {} : { shop: { userId: user.id } }),
      },
      select: {
        id: true,
        shopId: true,
        productId: true,
        productName: true,
        shop: { select: { userId: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "店铺商品不存在或无权限" }, { status: 404 });
    }

    const requestedValue = normalizePlatformId(body?.value);
    const operation = body?.operation ?? "replace";
    if (!["replace", "append", "remove"].includes(operation) || (platform !== "meituan" && operation !== "replace")) {
      return NextResponse.json({ error: "不支持的配对操作" }, { status: 400 });
    }
    const ownerId = existing.shop.userId;

    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.shopProduct.findUniqueOrThrow({ where: { id: existing.id }, select: { meituanSkuId: true } });
      const requestedIds = normalizeMeituanSkuIds(requestedValue);
      const currentIds = normalizeMeituanSkuIds(current.meituanSkuId);
      const nextIds = operation === "append" ? Array.from(new Set([...currentIds, ...requestedIds]))
        : operation === "remove" ? currentIds.filter((skuId) => !requestedIds.includes(skuId))
        : requestedIds;
      const value = platform === "meituan" ? nextIds.join(",") || null : requestedValue;
      if (value) {
        const conflictingItems = await tx.shopProduct.findMany({
          where: {
            shopId: existing.shopId,
            id: { not: existing.id },
            [field]: { not: null },
          },
          select: {
            id: true,
            jdSkuId: true,
            meituanSkuId: true,
            taobaoSkuId: true,
            doudianSkuId: true,
            productId: true,
          },
        });

        for (const other of conflictingItems) {
          const otherId = String(other.id);
          if (platform === "meituan") {
            const otherIds = normalizeMeituanSkuIds(other.meituanSkuId);
            const remainingIds = otherIds.filter((id) => !nextIds.includes(id));
            if (remainingIds.length !== otherIds.length) {
              await tx.shopProduct.update({
                where: { id: otherId },
                data: {
                  meituanSkuId: remainingIds.length > 0 ? remainingIds.join(",") : null,
                },
              });
              if (other.productId && other.productId !== existing.productId) {
                const otherProductSkus = await tx.productMeituanSku.findMany({
                  where: { productId: other.productId },
                  select: { meituanSkuId: true },
                });
                const remainingOtherProductMeituanSkuIds = otherProductSkus
                  .map((i) => i.meituanSkuId)
                  .filter((id) => !nextIds.includes(id));
                await replaceProductMeituanSkuMappings(tx, other.productId, ownerId, remainingOtherProductMeituanSkuIds);
              }
            }
          } else if (platform === "jd" && other.jdSkuId === value) {
            await tx.shopProduct.update({
              where: { id: otherId },
              data: { jdSkuId: null },
            });
          } else if (platform === "taobao" && other.taobaoSkuId === value) {
            await tx.shopProduct.update({
              where: { id: otherId },
              data: { taobaoSkuId: null },
            });
          } else if (platform === "doudian" && other.doudianSkuId === value) {
            await tx.shopProduct.update({
              where: { id: otherId },
              data: { doudianSkuId: null },
            });
          }
        }
      }

      const item = await tx.shopProduct.update({
        where: { id: existing.id },
        data: { [field]: value },
        select: {
          id: true,
          jdSkuId: true,
          meituanSkuId: true,
          taobaoSkuId: true,
          doudianSkuId: true,
        },
      });

      if (platform === "meituan" && existing.productId) {
        const otherShopProducts = await tx.shopProduct.findMany({
          where: {
            productId: existing.productId,
            id: { not: existing.id },
            shop: { userId: ownerId },
          },
          select: { meituanSkuId: true },
        });
        const allMeituanSkuIds = Array.from(new Set([
          ...nextIds,
          ...otherShopProducts.flatMap((p) => normalizeMeituanSkuIds(p.meituanSkuId)),
        ]));
        await replaceProductMeituanSkuMappings(tx, existing.productId, ownerId, allMeituanSkuIds);
      }

      if (value) {
        await tx.meituanImportItem.updateMany({
          where: {
            userId: ownerId,
            platform,
            meituanSkuId: { in: platform === "meituan" ? nextIds : [value] },
          },
          data: {
            bindProductId: existing.productId || null,
            status: "BOUND",
          },
        });
      }

      return item;
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (error) {
    console.error("PATCH /api/shop-products/[id]/platform-id 失败:", error);
    return NextResponse.json({ error: "保存平台商品 ID 失败" }, { status: 500 });
  }
}
