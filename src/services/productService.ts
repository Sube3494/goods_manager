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
    libraryId?: string;
    filterIds?: string[];
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
      libraryId,
      filterIds,
    } = params;

    const andConditions: Prisma.ProductWhereInput[] = [];

    // 如果传入了明确的 ID 列表，直接按它过滤，跳过其他安全判断以外的层层筛选
    if (filterIds && filterIds.length > 0) {
      andConditions.push({ id: { in: filterIds } });
    }

    // 判断是否有库的权限
    const isSuperAdmin = role === "SUPER_ADMIN";

    const checkLibraryAccess = async (libId: string): Promise<boolean> => {
      if (isSuperAdmin) return true;
      if (!userId) return false;
      
      const lib = await prisma.productLibrary.findUnique({
        where: { id: libId },
        select: { 
          isPublic: true,
          authorizedUsers: {
            where: { id: userId },
            select: { id: true }
          }
        }
      });
      if (!lib) return false;
      return lib.isPublic || lib.authorizedUsers.length > 0;
    };

    // 针对不同商品库进行权限判定与数据过滤
    if (libraryId) {
      const hasAccess = await checkLibraryAccess(libraryId);
      if (!hasAccess) {
        return {
          items: [],
          total: 0,
          page,
          pageSize,
          hasMore: false,
        };
      }
      andConditions.push({ libraryId });
    } else {
      // 若未显式传入 libraryId，过滤出用户有权查看的库
      if (!isSuperAdmin) {
        if (userId) {
          andConditions.push({
            OR: [
              { libraryId: null },
              { library: { isPublic: true } },
              { library: { authorizedUsers: { some: { id: userId } } } }
            ]
          });
        } else {
          // 未登录：只能看到公开库或无库商品
          andConditions.push({
            OR: [
              { libraryId: null },
              { library: { isPublic: true } }
            ]
          });
        }
      }
    }
    
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
          { jdSkuId: { contains: search, mode: "insensitive" } },
          { jdSkuMappings: { some: { jdSkuId: { contains: search, mode: "insensitive" } } } },
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
        
        if (totalCount < 100000) {
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
                    jdSkuMappings: { select: { jdSkuId: true }, orderBy: { createdAt: "asc" } },
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
              jdSkuMappings: { select: { jdSkuId: true }, orderBy: { createdAt: "asc" } },
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
      jdSkuIds: (p.jdSkuMappings as Array<{ jdSkuId: string }> | undefined)?.map((item) => item.jdSkuId) || (p.jdSkuId ? [p.jdSkuId as string] : []),
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
