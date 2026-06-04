import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { parseFactoryShipmentNote } from "@/lib/utils";
import { normalizeCustomerAddresses } from "@/lib/customerAddressBook";

function money(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function deriveShipmentStatus(itemCount: number, note: string | null | undefined) {
  const parsed = parseFactoryShipmentNote(note);
  const shippedCount = Math.min(
    itemCount,
    parsed.trackingEntries.filter((entry) => entry.trackingNumber?.trim()).length
  );

  if (itemCount <= 0 || shippedCount <= 0) return "待发货";
  if (shippedCount >= itemCount) return "已发货";
  return "部分发货";
}

export async function GET() {
  const user = await getAuthorizedUser("dashboard:read");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await prisma.systemSetting.findFirst({
    where: { userId: user.id },
    select: { lowStockThreshold: true },
  });
  const lowStockThreshold = settings?.lowStockThreshold ?? 10;

  const [
    products,
    shopProducts,
    purchases,
    shipments,
    userRecord,
    logisticsCompanies,
  ] = await Promise.all([
    prisma.product.findMany({
      where: { userId: user.id, isDiscontinued: false },
      select: { id: true, name: true, sku: true, stock: true, costPrice: true, image: true, updatedAt: true },
    }),
    prisma.shopProduct.findMany({
      where: { shop: { userId: user.id }, isDiscontinued: false },
      select: { id: true, productName: true, sku: true, stock: true, costPrice: true, productImage: true, updatedAt: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
      select: {
        id: true,
        date: true,
        status: true,
        totalAmount: true,
        items: {
          select: {
            quantity: true,
            product: { select: { name: true, image: true } },
            shopProduct: { select: { productName: true, productImage: true } },
          },
        },
      },
    }),
    prisma.outboundOrder.findMany({
      where: {
        userId: user.id,
        OR: [
          { note: { contains: "[销售]" } },
          { note: { contains: "[厂家发货]" } },
        ],
      },
      orderBy: { date: "desc" },
      select: {
        id: true,
        date: true,
        note: true,
        items: {
          select: {
            quantity: true,
            price: true,
            product: { select: { name: true, image: true } },
            shopProduct: { select: { productName: true, productImage: true } },
          },
        },
      },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { shippingAddresses: true },
    }),
    prisma.logisticsCompany.findMany({
      where: { userId: user.id },
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true, code: true },
    }),
  ]);

  const inventoryRows = [
    ...products.map((item) => ({
      id: item.id,
      name: item.name,
      sku: item.sku || "",
      stock: item.stock || 0,
      costPrice: item.costPrice || 0,
      image: item.image || "",
    })),
    ...shopProducts.map((item) => ({
      id: item.id,
      name: item.productName || "未命名货品",
      sku: item.sku || "",
      stock: item.stock || 0,
      costPrice: item.costPrice || 0,
      image: item.productImage || "",
    })),
  ];

  const totalStock = inventoryRows.reduce((sum, item) => sum + item.stock, 0);
  const totalInventoryValue = inventoryRows.reduce((sum, item) => sum + item.stock * item.costPrice, 0);
  const lowStockRows = inventoryRows
    .filter((item) => item.stock <= lowStockThreshold)
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 6);

  const pendingPurchases = purchases.filter((order) => order.status === "Confirmed" || order.status === "Ordered" || order.status === "Shipped");
  const receivedPurchases = purchases.filter((order) => order.status === "Received");
  const purchaseQuantity = purchases.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0);

  const shipmentSummaries = shipments.map((order) => {
    const parsed = parseFactoryShipmentNote(order.note);
    const itemCount = order.items.length;
    const quantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
    const amount = order.items.reduce((sum, item) => sum + item.quantity * (item.price || 0), 0);
    return {
      id: order.id,
      date: order.date,
      status: deriveShipmentStatus(itemCount, order.note),
      paymentStatus: parsed.paymentStatus || "未支付",
      compensationStatus: parsed.compensationStatus || "",
      recipientName: parsed.recipientName || "未填写收件人",
      quantity,
      amount,
      firstItemName: order.items[0]?.shopProduct?.productName || order.items[0]?.product?.name || "未填写货品",
      firstItemImage: order.items[0]?.shopProduct?.productImage || order.items[0]?.product?.image || "",
    };
  });

  const customers = normalizeCustomerAddresses(userRecord?.shippingAddresses);

  const recentActivity = [
    ...purchases.slice(0, 6).map((order) => ({
      id: `purchase-${order.id}`,
      type: "采购",
      title: "采购入库",
      subtitle: order.status === "Received" ? "已入库" : "待入库",
      date: order.date,
      amount: order.totalAmount,
      image: order.items[0]?.shopProduct?.productImage || order.items[0]?.product?.image || "",
      productName: order.items[0]?.shopProduct?.productName || order.items[0]?.product?.name || "采购单",
      quantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
    })),
    ...shipmentSummaries.slice(0, 6).map((order) => ({
      id: `shipment-${order.id}`,
      type: "发货",
      title: order.recipientName,
      subtitle: order.status,
      date: order.date,
      amount: order.amount,
      image: order.firstItemImage,
      productName: order.firstItemName,
      quantity: order.quantity,
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8);

  return NextResponse.json({
    inventory: {
      productCount: inventoryRows.length,
      totalStock,
      lowStockCount: inventoryRows.filter((item) => item.stock <= lowStockThreshold).length,
      zeroStockCount: inventoryRows.filter((item) => item.stock <= 0).length,
      totalValue: money(totalInventoryValue),
      lowStockThreshold,
      lowStockItems: lowStockRows,
    },
    purchases: {
      totalCount: purchases.length,
      pendingCount: pendingPurchases.length,
      receivedCount: receivedPurchases.length,
      pendingAmount: money(pendingPurchases.reduce((sum, order) => sum + (order.totalAmount || 0), 0)),
      totalQuantity: purchaseQuantity,
      recent: purchases.slice(0, 5).map((order) => ({
        id: order.id,
        date: order.date,
        status: order.status,
        totalAmount: order.totalAmount,
        firstItemName: order.items[0]?.shopProduct?.productName || order.items[0]?.product?.name || "采购单",
        itemCount: order.items.length,
      })),
    },
    shipments: {
      totalCount: shipmentSummaries.length,
      pendingCount: shipmentSummaries.filter((order) => order.status === "待发货").length,
      partialCount: shipmentSummaries.filter((order) => order.status === "部分发货").length,
      shippedCount: shipmentSummaries.filter((order) => order.status === "已发货").length,
      unpaidCount: shipmentSummaries.filter((order) => order.paymentStatus === "未支付").length,
      partialPaidCount: shipmentSummaries.filter((order) => order.paymentStatus === "部分支付").length,
      paidCount: shipmentSummaries.filter((order) => order.paymentStatus === "已支付").length,
      pendingCompensationCount: shipmentSummaries.filter((order) => order.compensationStatus === "待补偿").length,
      totalQuantity: shipmentSummaries.reduce((sum, order) => sum + order.quantity, 0),
      receivableAmount: money(shipmentSummaries
        .filter((order) => order.paymentStatus !== "已支付")
        .reduce((sum, order) => sum + order.amount, 0)),
      recent: shipmentSummaries.slice(0, 5),
    },
    customers: {
      count: customers.length,
      recent: customers
        .sort((a, b) => String(b.lastUsedAt || b.updatedAt || b.createdAt || "").localeCompare(String(a.lastUsedAt || a.updatedAt || a.createdAt || "")))
        .slice(0, 5)
        .map((item) => ({
          id: item.id,
          name: item.contactName || item.label || "未命名客户",
          phone: item.contactPhone || "",
          address: item.address || "",
          usageCount: item.usageCount || 0,
        })),
    },
    logistics: {
      count: logisticsCompanies.length,
      names: logisticsCompanies.slice(0, 8).map((item) => item.name),
    },
    recentActivity,
  });
}
