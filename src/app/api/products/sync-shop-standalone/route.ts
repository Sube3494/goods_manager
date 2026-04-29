import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { syncStandaloneShopProductToCatalog } from "@/lib/shopProductCatalogSync";

export async function POST() {
  try {
    const user = await getAuthorizedUser("product:update");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    }

    const shops = await prisma.shop.findMany({
      where: user.role === "SUPER_ADMIN" ? {} : { userId: user.id },
      select: {
        id: true,
        userId: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (shops.length === 0) {
      return NextResponse.json({ success: true, scanned: 0, synced: 0, shops: 0 });
    }

    const shopOwnerMap = new Map(
      shops
        .map((shop) => [shop.id, String(shop.userId || "").trim()] as const)
        .filter((entry) => Boolean(entry[1]))
    );

    const candidates = await prisma.shopProduct.findMany({
      where: {
        shopId: { in: Array.from(shopOwnerMap.keys()) },
        productId: null,
        sourceProductId: null,
      },
      select: {
        id: true,
        shopId: true,
        productName: true,
        jdSkuId: true,
        categoryId: true,
        categoryName: true,
        supplierId: true,
        productImage: true,
        remark: true,
      },
      orderBy: [
        { shopId: "asc" },
        { createdAt: "asc" },
      ],
    });

    if (candidates.length === 0) {
      return NextResponse.json({
        success: true,
        scanned: 0,
        synced: 0,
        shops: shopOwnerMap.size,
      });
    }

    let synced = 0;
    for (const item of candidates) {
      const ownerUserId = shopOwnerMap.get(item.shopId);
      const name = String(item.productName || "").trim();
      if (!ownerUserId || !name) {
        continue;
      }

      await prisma.$transaction(async (tx) => {
        const masterProduct = await syncStandaloneShopProductToCatalog(tx, {
          ownerUserId,
          name,
          jdSkuId: item.jdSkuId || null,
          categoryId: item.categoryId || null,
          categoryName: item.categoryName || null,
          supplierId: item.supplierId || null,
          image: item.productImage || null,
          remark: item.remark || null,
        });

        await tx.shopProduct.update({
          where: { id: item.id },
          data: {
            productId: masterProduct.productId,
            sourceProductId: masterProduct.productId,
            categoryId: masterProduct.categoryId || item.categoryId || null,
            categoryName: masterProduct.categoryName || item.categoryName || "未分类",
          },
        });
      });

      synced += 1;
    }

    return NextResponse.json({
      success: true,
      scanned: candidates.length,
      synced,
      shops: shopOwnerMap.size,
    });
  } catch (error) {
    console.error("Failed to sync standalone shop products into main catalog:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to sync standalone shop products",
    }, { status: 500 });
  }
}
