import prisma from "@/lib/prisma";
import { pinyin } from "pinyin-pro";
import { getStorageStrategy } from "@/lib/storage";
import { Prisma } from "../../prisma/generated-client";

export class ProductService {
  static generatePinyinSearchText(name: string): string {
    if (!name) return "";
    const fullPinyin = pinyin(name, { toneType: 'none', type: 'string', v: true }).replace(/\s+/g, '');
    const firstLetters = pinyin(name, { pattern: 'first', toneType: 'none', type: 'string' }).replace(/\s+/g, '');
    return `${fullPinyin} ${firstLetters}`.toLowerCase();
  }

  static naturalCompareText(a: string | null | undefined, b: string | null | undefined) {
    return String(a || "").localeCompare(String(b || ""), "zh-CN", {
      numeric: true,
      sensitivity: "base",
    });
  }

  static async getProducts(params: {
    userId?: string;
    role?: string;
    lowStockThreshold: number;
    page: number;
    pageSize: number;
    search: string;
    categoryName: string;
    status: string;
    field: string;
    order: 'asc' | 'desc';
    idsOnly: boolean;
    supplierId: string;
    includePublic?: boolean;
    publicOnly?: boolean;
    pickerView?: boolean;
    shopId?: string;
    shopFilterMode?: "assigned" | "unassigned";
    includeShopOnly?: boolean;
  }) {
    const {
      userId,
      role,
      lowStockThreshold,
      page,
      pageSize,
      search,
      categoryName,
      status,
      field,
      order,
      idsOnly,
      supplierId,
      includePublic = false,
      publicOnly = false,
      pickerView = false,
      shopId,
      shopFilterMode = "assigned",
      includeShopOnly = false,
    } = params;

    const andConditions: Prisma.ProductWhereInput[] = [];
    
    // Visibility and permission filtering logic
    if (publicOnly) {
      andConditions.push({ isPublic: true });
    } else if (shopId && shopFilterMode === "assigned") {
      andConditions.push({ shopProducts: { some: { shopId } } });
    } else if (!userId) {
      andConditions.push({ isPublic: true });
    } else if (role !== "SUPER_ADMIN") {
      andConditions.push(
        includePublic
          ? {
              OR: [
                { userId },
                { isPublic: true }
              ]
            }
          : { userId }
      );
    }

    if (!shopId && !includeShopOnly) {
      andConditions.push({ isShopOnly: false });
    }

    if (search) {
      andConditions.push({
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { sku: { contains: search, mode: "insensitive" } },
          { category: { name: { contains: search, mode: "insensitive" } } },
          { pinyin: { contains: search, mode: "insensitive" } }
        ]
      });
    }

    if (categoryName !== "all") andConditions.push({ category: { name: categoryName } });
    if (supplierId !== "all") {
      if (supplierId === "unknown") {
        andConditions.push({ supplierId: null });
      } else {
        andConditions.push({ supplierId: supplierId });
      }
    }

    if (shopId) {
      if (shopFilterMode === "unassigned") {
        andConditions.push({ shopProducts: { none: { shopId } } });
      }
    } else if (shopFilterMode === "unassigned") {
      andConditions.push({ shopProducts: { none: {} } });
    }

    if (status === "low_stock") {
      andConditions.push({ stock: { lt: lowStockThreshold } });
    } else if (status === "public") {
      andConditions.push({ isPublic: true });
    } else if (status === "private") {
      andConditions.push({ isPublic: false });
    } else if (status === "discontinued") {
      andConditions.push({ isDiscontinued: true });
    }

    const where = andConditions.length > 0 ? { AND: andConditions } : {};
    const skip = (page - 1) * pageSize;

    const standardOrderBy: Prisma.ProductOrderByWithRelationInput[] =
      field === "sku"
        ? [{ sku: order }, { id: "asc" }]
        : field === "stock"
          ? [{ stock: order }, { id: "asc" }]
          : field === "name"
            ? [{ name: order }, { id: "asc" }]
            : [{ createdAt: order }, { id: "asc" }];

    // Handle Natural Sort for SKU with performance consideration
    if (field === "sku") {
        const totalCount = await prisma.product.count({ where });
        
        if (totalCount < 500) {
            const allItems = await prisma.product.findMany({
              where,
              select: { id: true, sku: true },
            });

            allItems.sort((a, b) => {
              const aVal = a.sku || "";
              const bVal = b.sku || "";
              const skuCompare = order === 'asc'
                ? this.naturalCompareText(aVal, bVal)
                : this.naturalCompareText(bVal, aVal);
              if (skuCompare !== 0) {
                return skuCompare;
              }
              return this.naturalCompareText(a.id, b.id);
            });

            if (idsOnly) return { items: { ids: allItems.map(p => p.id), total: totalCount } };

            const pageIds = allItems.slice(skip, skip + pageSize).map(p => p.id);
            const detailedProducts = pickerView
              ? await prisma.product.findMany({
                  where: { id: { in: pageIds } },
                  select: { id: true, name: true, image: true, categoryId: true, category: true },
                })
              : await prisma.product.findMany({
                  where: { id: { in: pageIds } },
                  include: {
                    category: true,
                    supplier: true,
                    gallery: { take: 1 },
                    shopProducts: { select: { shopId: true } },
                  },
                });

            const sortedProducts = pageIds.map(id => detailedProducts.find(d => d.id === id)).filter(Boolean);
            return await this.formatResponse(sortedProducts, totalCount, page, pageSize);
        }
    }

    if (idsOnly) {
      const allIds = await prisma.product.findMany({ where, select: { id: true }, orderBy: standardOrderBy });
      return { items: { ids: allIds.map(p => p.id), total: allIds.length } };
    }

    const [pData, pTotal] = await Promise.all([
      pickerView
        ? prisma.product.findMany({
            where,
            select: { id: true, name: true, image: true, categoryId: true, category: true },
            orderBy: standardOrderBy,
            skip,
            take: pageSize,
          })
        : prisma.product.findMany({
            where,
            include: {
              category: true,
              supplier: true,
              gallery: { take: 1 },
              shopProducts: { select: { shopId: true } },
            },
            orderBy: standardOrderBy,
            skip,
            take: pageSize,
          }),
      prisma.product.count({ where })
    ]);

    return await this.formatResponse(pData, pTotal, page, pageSize);
  }

  static async formatResponse(products: unknown[], total: number, page: number, pageSize: number) {
    const storage = await getStorageStrategy();
    
    const resolved = (products as Record<string, unknown>[]).map(p => ({
      ...p,
      image: p.image ? storage.resolveUrl(p.image as string) : null,
      gallery: (p.gallery as Array<{ url: string }>)?.map((img) => ({ ...img, url: storage.resolveUrl(img.url) })) || [],
      assignedShopIds: (p.shopProducts as Array<{ shopId: string }> | undefined)?.map((item) => item.shopId) || [],
    }));

    return {
      items: resolved,
      total,
      page,
      pageSize,
      hasMore: (page * pageSize) < total,
    };
  }
}
