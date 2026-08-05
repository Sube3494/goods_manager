import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { isSameCustomerAddress, normalizeCustomerAddresses } from "@/lib/customerAddressBook";
import { getStorageStrategy } from "@/lib/storage";
import { parseFactoryShipmentNote } from "@/lib/utils";
import { Prisma } from "../../../../../prisma/generated-client";

function parseDateBoundary(value: string | null, endOfDay = false) {
  const date = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return new Date(`${date}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
}

function normalizeSearch(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function getItemName(item: {
  product?: { name?: string | null; sku?: string | null } | null;
  productVariant?: { variantName?: string | null; sku?: string | null } | null;
  shopProduct?: { productName?: string | null; sku?: string | null } | null;
  shopProductVariant?: { variantName?: string | null; sku?: string | null } | null;
  variantName?: string | null;
}) {
  return String(item.shopProduct?.productName || item.product?.name || "未知商品").trim();
}

function getItemVariant(item: {
  productVariant?: { variantName?: string | null } | null;
  shopProductVariant?: { variantName?: string | null } | null;
  variantName?: string | null;
}) {
  return String(item.shopProductVariant?.variantName || item.productVariant?.variantName || item.variantName || "").trim();
}

function getItemSku(item: {
  product?: { sku?: string | null } | null;
  productVariant?: { sku?: string | null } | null;
  shopProduct?: { sku?: string | null } | null;
  shopProductVariant?: { sku?: string | null } | null;
  variantSku?: string | null;
}) {
  return String(item.shopProductVariant?.sku || item.productVariant?.sku || item.variantSku || item.shopProduct?.sku || item.product?.sku || "").trim();
}

function getItemImage(item: {
  product?: { image?: string | null } | null;
  productVariant?: { image?: string | null } | null;
  shopProduct?: { productImage?: string | null; product?: { image?: string | null } | null } | null;
  shopProductVariant?: { variantImage?: string | null } | null;
}) {
  return String(item.shopProductVariant?.variantImage || item.productVariant?.image || item.shopProduct?.productImage || item.shopProduct?.product?.image || item.product?.image || "").trim();
}

function getItemStatsKey(item: {
  productId?: string | null;
  productVariantId?: string | null;
  shopProductId?: string | null;
  shopProductVariantId?: string | null;
  variantName?: string | null;
  variantSku?: string | null;
  product?: { name?: string | null; sku?: string | null } | null;
  productVariant?: { variantName?: string | null; sku?: string | null } | null;
  shopProduct?: { productName?: string | null; sku?: string | null } | null;
  shopProductVariant?: { variantName?: string | null; sku?: string | null } | null;
}) {
  return [
    item.shopProductVariantId || item.productVariantId || "",
    item.shopProductId || item.productId || "",
    getItemName(item),
    getItemVariant(item),
    getItemSku(item),
  ].join("|");
}

export async function GET(request: Request) {
  try {
    const session = await getAuthorizedUser("outbound:manage");
    if (!session) return NextResponse.json({ error: "Permission denied" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const group = String(searchParams.get("group") || "").trim();
    if (!group) return NextResponse.json({ error: "请选择客户分组" }, { status: 400 });

    const startDate = parseDateBoundary(searchParams.get("startDate"));
    const endDate = parseDateBoundary(searchParams.get("endDate"), true);
    const keyword = normalizeSearch(searchParams.get("keyword"));

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { shippingAddresses: true },
    });
    const customers = normalizeCustomerAddresses(user?.shippingAddresses);
    const groupCustomers = customers.filter((customer) => (customer.group || "") === group);
    if (groupCustomers.length === 0) {
      return NextResponse.json({ error: "该分组下暂无客户" }, { status: 404 });
    }

    const where: Prisma.OutboundOrderWhereInput = {
      userId: session.id,
      status: { in: ["已发货", "部分发货"] },
      OR: [{ note: { contains: "[厂家发货]" } }, { note: { contains: "[销售]" } }],
    };
    if (startDate || endDate) {
      where.date = { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) };
    }

    const storage = await getStorageStrategy();
    const orders = await prisma.outboundOrder.findMany({
      where,
      select: {
        id: true,
        date: true,
        status: true,
        note: true,
        items: {
          select: {
            id: true,
            quantity: true,
            productId: true,
            productVariantId: true,
            shopProductId: true,
            shopProductVariantId: true,
            variantName: true,
            variantSku: true,
            product: { select: { name: true, sku: true, image: true } },
            productVariant: { select: { variantName: true, sku: true, image: true } },
            shopProduct: { select: { productName: true, sku: true, productImage: true, product: { select: { image: true } } } },
            shopProductVariant: { select: { variantName: true, sku: true, variantImage: true } },
          },
        },
      },
      orderBy: { date: "desc" },
    });

    const records = orders.flatMap((order) => {
      const parsed = parseFactoryShipmentNote(order.note);
      if (!parsed.isFactoryShipment || !parsed.recipientAddress) return [];

      const matchedCustomer = groupCustomers.find((customer) =>
        isSameCustomerAddress(customer, {
          contactName: parsed.recipientName,
          contactPhone: parsed.recipientPhone,
          address: parsed.recipientAddress,
        })
      );
      if (!matchedCustomer) return [];

      const items = order.items
        .map((item) => {
          const name = getItemName(item);
          const variant = getItemVariant(item);
          const sku = getItemSku(item);
          const image = getItemImage(item);
          const searchText = normalizeSearch([name, variant, sku].filter(Boolean).join(" "));
          return {
            id: item.id,
            statsKey: getItemStatsKey(item),
            name,
            variant,
            sku,
            image: image ? storage.resolveUrl(image) : null,
            quantity: item.quantity || 0,
            tracking: parsed.trackingEntries.find((entry) => entry.itemKey === item.id) || null,
            searchText,
          };
        })
        .filter((item) => !keyword || item.searchText.includes(keyword))
        .map((item) => ({
          id: item.id,
          statsKey: item.statsKey,
          name: item.name,
          variant: item.variant,
          sku: item.sku,
          image: item.image,
          quantity: item.quantity,
          tracking: item.tracking,
        }));

      if (items.length === 0) return [];

      return [{
        id: order.id,
        date: order.date,
        status: order.status,
        customerId: matchedCustomer.id,
        customerName: matchedCustomer.contactName || matchedCustomer.label || "未命名客户",
        customerPhone: matchedCustomer.contactPhone || "",
        recipientName: parsed.recipientName,
        recipientPhone: parsed.recipientPhone,
        recipientAddress: parsed.recipientAddress,
        trackingNumbers: Array.from(new Set(items.map((item) => String(item.tracking?.trackingNumber || "").trim()).filter(Boolean))),
        logisticsNames: Array.from(new Set(items.map((item) => String(item.tracking?.logisticsName || "").trim()).filter(Boolean))),
        items,
      }];
    });

    const productStatsMap = new Map<string, {
      key: string;
      name: string;
      variant: string;
      sku: string;
      image: string | null;
      shipmentCount: number;
      totalQuantity: number;
    }>();
    for (const record of records) {
      const countedKeys = new Set<string>();
      for (const item of record.items) {
        const existing = productStatsMap.get(item.statsKey) || {
          key: item.statsKey,
          name: item.name,
          variant: item.variant,
          sku: item.sku,
          image: item.image,
          shipmentCount: 0,
          totalQuantity: 0,
        };
        existing.totalQuantity += item.quantity;
        if (!countedKeys.has(item.statsKey)) {
          existing.shipmentCount += 1;
          countedKeys.add(item.statsKey);
        }
        if (!existing.image && item.image) existing.image = item.image;
        productStatsMap.set(item.statsKey, existing);
      }
    }

    const customerStats = groupCustomers.map((customer) => {
      const customerRecords = records.filter((record) => record.customerId === customer.id);
      return {
        id: customer.id,
        name: customer.contactName || customer.label || "未命名客户",
        phone: customer.contactPhone || "",
        orderCount: customerRecords.length,
        totalQuantity: customerRecords.reduce((sum, record) => sum + record.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0),
      };
    }).filter((item) => item.orderCount > 0 || item.totalQuantity > 0);

    return NextResponse.json({
      group: { name: group, customerCount: groupCustomers.length },
      totalOrders: records.length,
      totalQuantity: records.reduce((sum, record) => sum + record.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0),
      productStats: Array.from(productStatsMap.values()).sort((a, b) => b.shipmentCount - a.shipmentCount || b.totalQuantity - a.totalQuantity || a.name.localeCompare(b.name, "zh-CN")),
      customerStats,
      records,
    });
  } catch (error) {
    console.error("Failed to fetch customer group shipment records:", error);
    return NextResponse.json({ error: "获取分组进货记录失败" }, { status: 500 });
  }
}
