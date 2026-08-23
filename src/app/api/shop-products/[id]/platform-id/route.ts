import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { normalizeMeituanSkuIds, replaceProductMeituanSkuMappings } from "@/lib/productMeituanSku";

const PLATFORM_FIELD = {
  jd: "jdSkuId",
  meituan: "meituanSkuId",
  taobao: "taobaoSkuId",
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
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "店铺商品不存在或无权限" }, { status: 404 });
    }

    const value = normalizePlatformId(body?.value);

    const updated = await prisma.$transaction(async (tx) => {
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
            productId: true,
          },
        });

        for (const other of conflictingItems) {
          const otherId = String(other.id);
          if (platform === "meituan") {
            const otherIds = normalizeMeituanSkuIds(other.meituanSkuId);
            const remainingIds = otherIds.filter((id) => id !== value);
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
                  .filter((id) => id !== value);
                await replaceProductMeituanSkuMappings(tx, other.productId, user.id, remainingOtherProductMeituanSkuIds);
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
        },
      });

      if (platform === "meituan" && existing.productId) {
        const nextIds = value ? normalizeMeituanSkuIds(value) : [];
        const otherShopProducts = await tx.shopProduct.findMany({
          where: {
            productId: existing.productId,
            id: { not: existing.id },
            shop: { userId: user.id },
          },
          select: { meituanSkuId: true },
        });
        const allMeituanSkuIds = Array.from(new Set([
          ...nextIds,
          ...otherShopProducts.flatMap((p) => normalizeMeituanSkuIds(p.meituanSkuId)),
        ]));
        await replaceProductMeituanSkuMappings(tx, existing.productId, user.id, allMeituanSkuIds);
      }

      if (value) {
        await tx.meituanImportItem.updateMany({
          where: {
            userId: user.id,
            platform,
            meituanSkuId: value,
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
