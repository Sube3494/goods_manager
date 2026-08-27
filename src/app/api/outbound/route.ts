import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from '../../../../prisma/generated-client';
import { getAuthorizedUser } from "@/lib/auth";
import { InventoryService } from "@/services/inventoryService";
import { FinanceMath } from "@/lib/math";
import { getStorageStrategy } from "@/lib/storage";
import { getOutboundOrderItemSchemaErrorMessage } from "@/lib/prismaSchemaCompat";
import { getOutboundReturnedQuantityMap, parseOutboundReturnMeta } from "@/lib/outboundReturnMeta";
import { getPlatformMeta, parseOutboundNote } from "@/lib/utils";
 
interface OutboundItem {
  productId: string;
  shopProductId?: string;
  quantity: number;
  price?: number;
}

function normalizeOutboundType(value: string | null) {
  const normalized = String(value || "").trim();
  return normalized && normalized !== "all" ? normalized : null;
}

function normalizeOption(value: string | null, allLabel: string) {
  const normalized = String(value || "").trim();
  return normalized && normalized !== allLabel ? normalized : null;
}

function resolveOutboundShopName(order: {
  note?: string | null;
  shopName?: string | null;
  items: Array<{ shopProduct?: { shop?: { name?: string | null } | null } | null }>;
}) {
  const noteShopName = parseOutboundNote(order.note).shopName;
  if (noteShopName) return noteShopName;
  return order.items.find((item) => item.shopProduct?.shop?.name)?.shopProduct?.shop?.name || order.shopName || null;
}

function resolveOutboundPlatform(note: string | null | undefined) {
  const rawPlatform = parseOutboundNote(note).platform;
  return getPlatformMeta(rawPlatform)?.name || null;
}

const OUTBOUND_PLATFORM_ORDER = ["美团", "京东", "淘宝", "抖店", "线下交易"] as const;

function sortOutboundPlatforms(platforms: string[]) {
  return [...platforms].sort((a, b) => {
    const aIndex = OUTBOUND_PLATFORM_ORDER.indexOf(a as typeof OUTBOUND_PLATFORM_ORDER[number]);
    const bIndex = OUTBOUND_PLATFORM_ORDER.indexOf(b as typeof OUTBOUND_PLATFORM_ORDER[number]);
    if (aIndex >= 0 || bIndex >= 0) {
      return (aIndex >= 0 ? aIndex : OUTBOUND_PLATFORM_ORDER.length) - (bIndex >= 0 ? bIndex : OUTBOUND_PLATFORM_ORDER.length);
    }
    return a.localeCompare(b, "zh-CN");
  });
}

function getOutboundItemReturnedQuantity(
  order: { note?: string | null; status?: string | null },
  item: { id: string; quantity: number }
) {
  const returnEntries = parseOutboundReturnMeta(order.note).returns;
  if (returnEntries.length > 0) {
    return Math.min(item.quantity, getOutboundReturnedQuantityMap(returnEntries).get(item.id) || 0);
  }

  return order.status === "Returned" ? item.quantity : 0;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthorizedUser("outbound:manage");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(10, Number.parseInt(searchParams.get("pageSize") || "20", 10) || 20));
    const search = String(searchParams.get("q") || "").trim().toLowerCase();
    const typeFilter = normalizeOutboundType(searchParams.get("type"));
    const platformFilter = normalizeOption(searchParams.get("platform"), "全部平台");
    const shopFilter = normalizeOption(searchParams.get("shop"), "全部门店");
    const startDate = String(searchParams.get("startDate") || "").trim();
    const endDate = String(searchParams.get("endDate") || "").trim();
    const includeAnalytics = searchParams.get("analytics") === "1";

    const where: Prisma.OutboundOrderWhereInput = {
      userId: user.id,
      ...(typeFilter ? { type: typeFilter } : {}),
      ...((startDate || endDate) ? {
        date: {
          ...(startDate ? { gte: new Date(`${startDate}T00:00:00.000`) } : {}),
          ...(endDate ? { lte: new Date(`${endDate}T23:59:59.999`) } : {}),
        },
      } : {}),
      ...(search ? {
        OR: [
          { id: { contains: search, mode: "insensitive" } },
          { note: { contains: search, mode: "insensitive" } },
          { items: { some: { product: { name: { contains: search, mode: "insensitive" } } } } },
          { items: { some: { shopProduct: { productName: { contains: search, mode: "insensitive" } } } } },
        ],
      } : {}),
    };

    const shouldPostFilter = Boolean(platformFilter || shopFilter);
    const takeForFilter = shouldPostFilter ? 500 : pageSize;
    const skipForFilter = shouldPostFilter ? 0 : (page - 1) * pageSize;

    const orderSelect = {
      id: true,
      type: true,
      date: true,
      note: true,
      createdAt: true,
      updatedAt: true,
      status: true,
      items: {
        select: {
          id: true,
          outboundOrderId: true,
          productId: true,
          shopProductId: true,
          quantity: true,
          price: true,
          costSnapshot: true,
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              image: true,
            },
          },
          shopProduct: {
            select: {
              id: true,
              productId: true,
              sourceProductId: true,
              sku: true,
              productName: true,
              productImage: true,
              categoryId: true,
              categoryName: true,
              supplierId: true,
              costPrice: true,
              stock: true,
              shopId: true,
              isPublic: true,
              isDiscontinued: true,
              remark: true,
              specs: true,
              createdAt: true,
              updatedAt: true,
              shop: { select: { id: true, name: true } },
            },
          },
        },
      },
    } satisfies Prisma.OutboundOrderSelect;

    const [orders, total, filterSource, analyticsSource] = await Promise.all([
      prisma.outboundOrder.findMany({
        where,
        select: orderSelect,
        orderBy: { date: "desc" },
        skip: skipForFilter,
        take: takeForFilter,
      }),
      shouldPostFilter ? Promise.resolve(0) : prisma.outboundOrder.count({ where }),
      prisma.outboundOrder.findMany({
        where: { userId: user.id },
        select: {
          note: true,
          items: {
            select: {
              shopProduct: {
                select: {
                  shop: { select: { name: true } },
                },
              },
            },
          },
        },
        orderBy: { date: "desc" },
        take: 1000,
      }),
      includeAnalytics
        ? prisma.outboundOrder.findMany({
            where,
            select: orderSelect,
            orderBy: { date: "desc" },
            take: 5000,
          })
        : Promise.resolve([]),
    ]);

    const filteredOrders = shouldPostFilter
      ? orders.filter((order) => {
          const platform = resolveOutboundPlatform(order.note);
          const shopName = resolveOutboundShopName(order);
          return (!platformFilter || platform === platformFilter)
            && (!shopFilter || shopName === shopFilter);
        })
      : orders;
    const pageOrders = shouldPostFilter
      ? filteredOrders.slice((page - 1) * pageSize, page * pageSize)
      : filteredOrders;
    const responseTotal = shouldPostFilter ? filteredOrders.length : total;

    const allPlatforms = sortOutboundPlatforms(Array.from(new Set(filterSource.map((order) => resolveOutboundPlatform(order.note)).filter(Boolean) as string[])));
    const allShopNames = Array.from(new Set(filterSource.map((order) => resolveOutboundShopName(order)).filter(Boolean) as string[])).sort();

    const storage = await getStorageStrategy();
    const analyticsOrders = includeAnalytics ? (shouldPostFilter
      ? analyticsSource.filter((order) => {
          const platform = resolveOutboundPlatform(order.note);
          const shopName = resolveOutboundShopName(order);
          return (!platformFilter || platform === platformFilter)
            && (!shopFilter || shopName === shopFilter);
        })
      : analyticsSource
    ).filter((order) => order.type === "Sale") : [];

    const productSalesMap = new Map<string, {
      key: string;
      productId: string | null;
      shopProductId: string | null;
      name: string;
      sku: string | null;
      image: string | null;
      shopName: string | null;
      soldQuantity: number;
      returnedQuantity: number;
      netQuantity: number;
      orderCount: number;
      lastOutboundAt: Date | null;
    }>();

    analyticsOrders.forEach((order) => {
      const countedOrderKeys = new Set<string>();
      order.items.forEach((item) => {
        const shopProduct = item.shopProduct;
        const shopName = shopProduct?.shop?.name || resolveOutboundShopName(order) || null;
        const productKey = item.shopProductId || item.productId || item.product?.sku || item.product?.name || item.id;
        const key = `${shopName || "未分门店"}::${productKey}`;
        const existing = productSalesMap.get(key) || {
          key,
          productId: item.productId || shopProduct?.productId || null,
          shopProductId: item.shopProductId || null,
          name: shopProduct?.productName || item.product?.name || "未知商品",
          sku: shopProduct?.sku || item.product?.sku || null,
          image: shopProduct?.productImage || item.product?.image || null,
          shopName,
          soldQuantity: 0,
          returnedQuantity: 0,
          netQuantity: 0,
          orderCount: 0,
          lastOutboundAt: null,
        };

        const quantity = Math.max(0, Number(item.quantity || 0));
        const returnedQuantity = getOutboundItemReturnedQuantity(order, {
          id: item.id,
          quantity,
        });

        existing.soldQuantity += quantity;
        existing.returnedQuantity += returnedQuantity;
        existing.netQuantity = Math.max(0, existing.soldQuantity - existing.returnedQuantity);
        if (!countedOrderKeys.has(key)) {
          existing.orderCount += 1;
          countedOrderKeys.add(key);
        }
        if (!existing.lastOutboundAt || order.date > existing.lastOutboundAt) {
          existing.lastOutboundAt = order.date;
        }

        productSalesMap.set(key, existing);
      });
    });

    const productSales = Array.from(productSalesMap.values())
      .map((item) => ({
        ...item,
        image: item.image ? storage.resolveUrl(item.image) : item.image,
        returnRate: item.soldQuantity > 0 ? item.returnedQuantity / item.soldQuantity : 0,
        lastOutboundAt: item.lastOutboundAt ? item.lastOutboundAt.toISOString() : null,
      }))
      .sort((a, b) => b.soldQuantity - a.soldQuantity || b.returnRate - a.returnRate);

    const soldQuantity = productSales.reduce((sum, item) => sum + item.soldQuantity, 0);
    const returnedQuantity = productSales.reduce((sum, item) => sum + item.returnedQuantity, 0);

    const normalizedOrders = pageOrders.map((order) => ({
      ...order,
      items: order.items.map((item) => ({
        ...item,
        product: item.product ? {
          ...item.product,
          image: item.product.image ? storage.resolveUrl(item.product.image) : item.product.image,
        } : item.product,
        shopProduct: item.shopProduct ? {
          id: item.shopProduct.id,
          productId: item.shopProduct.productId,
          sourceProductId: item.shopProduct.sourceProductId,
          sku: item.shopProduct.sku,
          name: item.shopProduct.productName || item.product?.name || "未知商品",
          image: item.shopProduct.productImage ? storage.resolveUrl(item.shopProduct.productImage) : (item.product?.image ? storage.resolveUrl(item.product.image) : null),
          categoryId: item.shopProduct.categoryId,
          categoryName: item.shopProduct.categoryName,
          supplierId: item.shopProduct.supplierId,
          costPrice: item.shopProduct.costPrice,
          stock: item.shopProduct.stock,
          shopId: item.shopProduct.shopId,
          shopName: item.shopProduct.shop?.name || null,
          isPublic: item.shopProduct.isPublic,
          isDiscontinued: item.shopProduct.isDiscontinued,
          remark: item.shopProduct.remark,
          specs: item.shopProduct.specs as Record<string, string> | null,
          createdAt: item.shopProduct.createdAt,
          updatedAt: item.shopProduct.updatedAt,
        } : item.shopProduct,
      })),
    }));

    return NextResponse.json({
      items: normalizedOrders,
      meta: {
        total: responseTotal,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(responseTotal / pageSize)),
      },
      filters: {
        platforms: allPlatforms,
        shops: allShopNames,
      },
      ...(includeAnalytics ? { analytics: {
        productSales,
        totals: {
          soldQuantity,
          returnedQuantity,
          netQuantity: Math.max(0, soldQuantity - returnedQuantity),
          skuCount: productSales.length,
          returnRate: soldQuantity > 0 ? returnedQuantity / soldQuantity : 0,
        },
      } } : {}),
    });
  } catch (error) {
    console.error("Failed to fetch outbound orders:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthorizedUser("outbound:manage");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    }

    const body = await request.json();
    const { type, date, note, items } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Invalid items" }, { status: 400 });
    }

    const requestedShopProductIds = items
      .map((item: OutboundItem) => item.shopProductId)
      .filter((id: unknown): id is string => typeof id === "string" && id.trim() !== "");

    const shopProducts = requestedShopProductIds.length > 0
      ? await prisma.shopProduct.findMany({
          where: {
            id: { in: requestedShopProductIds },
            shop: { userId: user.id },
          },
          select: {
            id: true,
            productId: true,
          }
        })
      : [];
    const shopProductMap = new Map(shopProducts.map((item) => [item.id, item]));
    const normalizedItems = items.map((item: OutboundItem) => {
      const shopProduct = item.shopProductId ? shopProductMap.get(item.shopProductId) : null;
      return {
        productId: shopProduct?.productId || item.productId || null,
        shopProductId: shopProduct?.id || null,
        quantity: item.quantity,
        price: item.price,
      };
    });

    // 使用事务确保数据原子性，业务逻辑委托给 InventoryService
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const costSnapshots = await InventoryService.processOutboundFIFO(
        tx,
        user.id,
        normalizedItems.map((item) => ({
          productId: item.productId || null,
          shopProductId: item.shopProductId || null,
          quantity: item.quantity,
        }))
      );

      // 1. 创建出库单记录
      const order = await tx.outboundOrder.create({
        data: {
          type: type || "Sale",
          date: date ? new Date(date) : new Date(),
          note: note || "",
          userId: user.id,
          items: {
            create: normalizedItems.map((item) => {
              const costSnapshot = costSnapshots.shift();
              return {
                productId: item.productId || null,
                shopProductId: item.shopProductId || null,
                quantity: item.quantity,
                price: FinanceMath.add(item.price || 0, 0),
                costSnapshot: (costSnapshot || Prisma.JsonNull) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
              };
            })
          }
        }
      });

      return order;
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = getOutboundOrderItemSchemaErrorMessage(error)
      || (error instanceof Error ? error.message : "Failed to process outbound order");
    console.error("Outbound processing failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
