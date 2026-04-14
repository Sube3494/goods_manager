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
  createdAt: Date;
  updatedAt: Date;
};

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
      sourceProductId: item.productId,
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

    normalizedItems.sort((a, b) => {
      const aName = `${a.name} ${a.sku || ""}`.toLowerCase();
      const bName = `${b.name} ${b.sku || ""}`.toLowerCase();
      return aName.localeCompare(bName, "zh-CN", { numeric: true, sensitivity: "base" });
    });

    const start = (page - 1) * pageSize;
    const items = normalizedItems.slice(start, start + pageSize);

    return NextResponse.json({
      items,
      total: normalizedItems.length,
      page,
      pageSize,
      hasMore: start + items.length < normalizedItems.length,
    });
  } catch (error) {
    console.error("Failed to fetch purchase products:", error);
    return NextResponse.json({ error: "Failed to fetch purchase products" }, { status: 500 });
  }
}
