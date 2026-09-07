import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";

// POST /api/shops/sync-images
// 升级存量历史店铺商品图片：将关联主库但残留旧图/写死图片的 ShopProduct.productImage 清洗对齐
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthorizedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isSuperAdmin = user.role === "SUPER_ADMIN";
    const body = await request.json().catch(() => ({}));
    const targetShopId = body?.shopId ? String(body.shopId) : undefined;

    // 过滤条件：普通用户只能更新属于自己的店铺
    const shopWhere = isSuperAdmin
      ? (targetShopId ? { shopId: targetShopId } : {})
      : {
          shop: {
            userId: user.id,
            ...(targetShopId ? { id: targetShopId } : {}),
          },
        };

    // 查询所有关联了主库商品的店铺商品
    const shopProducts = await prisma.shopProduct.findMany({
      where: {
        productId: { not: null },
        ...shopWhere,
      },
      select: {
        id: true,
        shopId: true,
        productId: true,
        productImage: true,
        product: {
          select: {
            id: true,
            image: true,
            gallery: {
              select: { url: true },
            },
          },
        },
      },
    });

    let updatedToInheritCount = 0;
    let customImageCount = 0;
    let alreadyInheritedCount = 0;
    const idsToResetToNull: string[] = [];

    for (const sp of shopProducts) {
      // 已经处于继承模式（productImage 为 null）
      if (!sp.productImage) {
        alreadyInheritedCount++;
        continue;
      }

      const prod = sp.product;
      if (!prod) continue;

      const mainImage = prod.image || "";
      const galleryUrls = new Set(prod.gallery.map((g) => g.url).filter(Boolean));

      // 判定是否属于主库的图片（包括当前主图、相册中的历史图片、或者主图路径一致）
      const isFromMainProduct =
        sp.productImage === mainImage ||
        galleryUrls.has(sp.productImage) ||
        (mainImage && (sp.productImage.endsWith(mainImage) || mainImage.endsWith(sp.productImage)));

      if (isFromMainProduct) {
        // 说明该图片来自主库，应重置为 null 从而动态继承主库最新图片
        idsToResetToNull.push(sp.id);
        updatedToInheritCount++;
      } else {
        // 如果不是当前主图也不是当前相册图，很可能是已被从相册删除的孤立死链
        // 只有当 forceAll = true 时才强制重置，默认保留可能是用户单独上传的图片
        if (body?.forceAll) {
          idsToResetToNull.push(sp.id);
          updatedToInheritCount++;
        } else {
          customImageCount++;
        }
      }
    }

    // 批量分批将 productImage 重置为 null
    const BATCH_SIZE = 500;
    for (let i = 0; i < idsToResetToNull.length; i += BATCH_SIZE) {
      const chunk = idsToResetToNull.slice(i, i + BATCH_SIZE);
      await prisma.shopProduct.updateMany({
        where: { id: { in: chunk } },
        data: { productImage: null },
      });
    }

    return NextResponse.json({
      success: true,
      totalScanned: shopProducts.length,
      updatedToInheritCount,
      alreadyInheritedCount,
      customImageCount,
      message: `升级对齐完成：扫描 ${shopProducts.length} 件商品，成功将 ${updatedToInheritCount} 件商品升级为继承主库模式，${alreadyInheritedCount} 件此前已继承，保留 ${customImageCount} 件店铺专属封面。`,
    });
  } catch (error) {
    console.error("Failed to sync shop images:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync shop images" },
      { status: 500 }
    );
  }
}
