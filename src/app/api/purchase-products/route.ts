import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { getStorageStrategy } from "@/lib/storage";

type PurchasePickerItem = {
  id: string;
  sourceType: "product" | "shopProduct";
  shopProductId?: string;
  sourceProductId?: string;
  shopId?: string;
  shopName?: string;
  sku: string;
  name: string;
  categoryId: string;
  category?: { id: string; name: string; count: number };
  costPrice: number | null;
  stock: number | null;
  image: string | null;
  isPublic: boolean | null;
  isDiscontinued: boolean | null;
  isShopOnly: boolean;
  supplierId?: string;
  supplier?: undefined;
  remark: string | null;
  isStandaloneShopProduct?: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const naturalSortCollator = new Intl.Collator("zh-CN", {
  numeric: true,
  sensitivity: "base",
});

function comparePurchasePickerItems(a: PurchasePickerItem, b: PurchasePickerItem) {
  const skuCompare = naturalSortCollator.compare(
    String(a.sku || "").trim(),
    String(b.sku || "").trim()
  );
  if (skuCompare !== 0) {
    return skuCompare;
  }

  const nameCompare = naturalSortCollator.compare(
    String(a.name || "").trim(),
    String(b.name || "").trim()
  );
  if (nameCompare !== 0) {
    return nameCompare;
  }

  const shopCompare = naturalSortCollator.compare(
    String(a.shopName || "").trim(),
    String(b.shopName || "").trim()
  );
  if (shopCompare !== 0) {
    return shopCompare;
  }

  return naturalSortCollator.compare(
    String(a.id || "").trim(),
    String(b.id || "").trim()
  );
}

function buildPurchasePickerDedupeKey(item: PurchasePickerItem) {
  const shopId = String(item.shopId || "").trim();
  const sku = String(item.sku || "").trim().toLowerCase();
  const name = String(item.name || "").trim().toLowerCase();
  if (shopId && sku) {
    return `${shopId}::sku::${sku}`;
  }
  if (shopId && name) {
    return `${shopId}::name::${name}`;
  }
  return String(item.id || "").trim();
}

function scorePurchasePickerItem(item: PurchasePickerItem) {
  let score = 0;
  if (!item.isStandaloneShopProduct) score += 20;
  if (String(item.sourceProductId || "").trim()) score += 10;
  if (String(item.sku || "").trim()) score += 5;
  return score;
}

export async function GET(request: Request) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "purchase:manage") && !hasPermission(session, "inbound:manage")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const allMode = searchParams.get("all") === "true";
    const pageSize = allMode ? 999999 : Math.min(parseInt(searchParams.get("pageSize") || "20", 10), 2000);
    const search = (searchParams.get("search") || "").trim().toLowerCase();
    const supplierId = searchParams.get("supplierId") || "";
    const shopId = searchParams.get("shopId") || "";
    const shopName = (searchParams.get("shopName") || "").trim();
    const aggregateSource = searchParams.get("aggregateSource") === "true";

    const shopProducts = await prisma.shopProduct.findMany({
      where: {
        shop: {
          userId: session.id,
          ...(shopId ? { id: shopId } : {}),
          ...(shopName ? { name: shopName } : {}),
        },
        ...(search ? {
          OR: [
            { productName: { contains: search, mode: "insensitive" } },
            { sku: { contains: search, mode: "insensitive" } },
            { pinyin: { contains: search, mode: "insensitive" } },
          ],
        } : {}),
        ...(supplierId ? { supplierId } : {}),
      },
      include: {
        shop: { select: { id: true, name: true } },
      },
      orderBy: [{ updatedAt: "desc" }],
    });

    const storage = await getStorageStrategy();
    const merged: PurchasePickerItem[] = shopProducts.map((item) => ({
      id: item.id,
      sourceType: "shopProduct" as const,
      shopProductId: item.id,
      sourceProductId: item.sourceProductId || item.productId || item.id,
      shopId: item.shopId,
      shopName: item.shop.name,
      sku: item.sku || "",
      name: item.productName || "未命名商品",
      categoryId: item.categoryId || "",
      category: item.categoryName ? { id: item.categoryId || "", name: item.categoryName, count: 0 } : undefined,
      costPrice: item.costPrice,
      stock: item.stock,
      image: item.productImage ? storage.resolveUrl(item.productImage) : null,
      isPublic: item.isPublic,
      isDiscontinued: item.isDiscontinued,
      isShopOnly: true,
      supplierId: item.supplierId || undefined,
      supplier: undefined,
      remark: item.remark,
      isStandaloneShopProduct: !item.productId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    const normalizedItems = aggregateSource
      ? Array.from(
          merged.reduce((acc, item) => {
            const key = item.sourceProductId || item.shopProductId || item.id;
            const existing = acc.get(key);
            if (!existing) {
              acc.set(key, {
                ...item,
                id: item.sourceProductId || item.id,
                shopProductId: undefined,
                sourceType: "product" as const,
                stock: item.stock || 0,
              });
              return acc;
            }

            acc.set(key, {
              ...existing,
              stock: (existing.stock || 0) + (item.stock || 0),
              updatedAt:
                new Date(item.updatedAt || 0).getTime() > new Date(existing.updatedAt || 0).getTime()
                  ? item.updatedAt
                  : existing.updatedAt,
            });
            return acc;
          }, new Map<string, PurchasePickerItem>())
        ).map(([, value]) => value)
      : merged;

    const dedupedItems = Array.from(
      normalizedItems.reduce((acc, item) => {
        const key = buildPurchasePickerDedupeKey(item);
        const existing = acc.get(key);
        if (!existing || scorePurchasePickerItem(item) > scorePurchasePickerItem(existing)) {
          acc.set(key, item);
        }
        return acc;
      }, new Map<string, PurchasePickerItem>())
    ).map(([, value]) => value);

    dedupedItems.sort(comparePurchasePickerItems);

    const start = (page - 1) * pageSize;
    const items = dedupedItems.slice(start, start + pageSize);

    return NextResponse.json({
      items,
      total: dedupedItems.length,
      page,
      pageSize,
      hasMore: start + items.length < dedupedItems.length,
    });
  } catch (error) {
    console.error("Failed to fetch purchase products:", error);
    return NextResponse.json({ error: "Failed to fetch purchase products" }, { status: 500 });
  }
}
