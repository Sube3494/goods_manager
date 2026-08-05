import { NextResponse } from "next/server";
import { Prisma } from "../../../../prisma/generated-client";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { CustomerAddressItem, isSameCustomerAddress, normalizeCustomerAddresses } from "@/lib/customerAddressBook";
import { parseFactoryShipmentNote } from "@/lib/utils";

function sortCustomers(customers: CustomerAddressItem[]) {
  return [...customers].sort((a, b) => {
    const lastA = a.lastUsedAt || a.updatedAt || a.createdAt || "";
    const lastB = b.lastUsedAt || b.updatedAt || b.createdAt || "";
    if (lastA !== lastB) return lastB.localeCompare(lastA);
    return (a.contactName || a.label).localeCompare(b.contactName || b.label, "zh-Hans-CN");
  });
}

function parseDateBoundary(value: string | null, endOfDay = false) {
  const date = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  return new Date(`${date}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+08:00`);
}

function normalizeColumnKey(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/[：:]/g, "")
    .replace(/[\s_-]+/g, "")
    .toLowerCase()
    .trim();
}

function getStringValue(row: Record<string, unknown>, keys: string[]) {
  const normalizedEntries = Object.entries(row).map(([key, value]) => [normalizeColumnKey(key), value] as const);

  for (const key of keys) {
    const directValue = row[key];
    if (directValue !== undefined && directValue !== null && String(directValue).trim()) {
      return String(directValue).trim();
    }
  }

  for (const key of keys) {
    const normalizedKey = normalizeColumnKey(key);
    const matched = normalizedEntries.find(([entryKey, value]) =>
      entryKey === normalizedKey && value !== undefined && value !== null && String(value).trim()
    );
    if (matched) {
      return String(matched[1]).trim();
    }
  }

  return "";
}

async function applyShipmentUsageStats(
  customers: CustomerAddressItem[],
  userId: string,
  startDate: Date | null,
  endDate: Date | null
) {
  if (customers.length === 0) {
    return customers;
  }

  const where: Prisma.OutboundOrderWhereInput = {
    userId,
    status: { in: ["已发货", "部分发货"] },
    OR: [
      { note: { contains: "[厂家发货]" } },
      { note: { contains: "[销售]" } },
    ],
  };

  if (startDate || endDate) {
    where.date = {
      ...(startDate ? { gte: startDate } : {}),
      ...(endDate ? { lte: endDate } : {}),
    };
  }

  const orders = await prisma.outboundOrder.findMany({
    where,
    select: {
      note: true,
    },
  });

  const counts = new Map<string, number>();
  for (const order of orders) {
    const parsed = parseFactoryShipmentNote(order.note);
    if (!parsed.isFactoryShipment || !parsed.recipientAddress) {
      continue;
    }

    const matched = customers.find((customer) =>
      isSameCustomerAddress(customer, {
        contactName: parsed.recipientName,
        contactPhone: parsed.recipientPhone,
        address: parsed.recipientAddress,
      })
    );

    if (matched) {
      counts.set(matched.id, (counts.get(matched.id) || 0) + 1);
    }
  }

  return customers.map((customer) => ({
    ...customer,
    usageCount: counts.get(customer.id) || 0,
  }));
}

export async function GET(request: Request) {
  try {
    const session = await getAuthorizedUser("outbound:manage");
    if (!session) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = parseDateBoundary(searchParams.get("startDate"));
    const endDate = parseDateBoundary(searchParams.get("endDate"), true);

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { shippingAddresses: true },
    });

    const customers = normalizeCustomerAddresses(user?.shippingAddresses);
    const customersWithStats = await applyShipmentUsageStats(customers, session.id, startDate, endDate);

    return NextResponse.json(sortCustomers(customersWithStats));
  } catch (error) {
    console.error("Failed to fetch customers:", error);
    return NextResponse.json({ error: "获取客户失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getAuthorizedUser("outbound:manage");
    if (!session) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const body = await request.json();
    const contactName = String(body.contactName || "").trim();
    const contactPhone = String(body.contactPhone || "").trim();
    const address = String(body.address || body.detailAddress || "").trim();
    const group = String(body.group || "").trim();

    if (!contactName) {
      return NextResponse.json({ error: "客户姓名不能为空" }, { status: 400 });
    }
    if (!contactPhone) {
      return NextResponse.json({ error: "客户手机号不能为空" }, { status: 400 });
    }
    if (!address) {
      return NextResponse.json({ error: "客户地址不能为空" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { shippingAddresses: true },
    });
    const customers = normalizeCustomerAddresses(user?.shippingAddresses);
    const duplicate = customers.some((customer) =>
      isSameCustomerAddress(customer, { contactName, contactPhone, address })
    );
    if (duplicate) {
      return NextResponse.json({ error: "该客户地址已存在" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const created: CustomerAddressItem = {
      id: `customer_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      label: [contactName, contactPhone ? contactPhone.slice(-4) : ""].filter(Boolean).join(" "),
      address,
      detailAddress: address,
      contactName,
      contactPhone,
      group,
      isDefault: customers.length === 0,
      source: "manual",
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
      usageCount: 0,
    };

    const nextCustomers = [...customers, created];
    await prisma.user.update({
      where: { id: session.id },
      data: { shippingAddresses: nextCustomers as unknown as Prisma.InputJsonValue },
    });

    return NextResponse.json(created);
  } catch (error) {
    console.error("Failed to create customer:", error);
    return NextResponse.json({ error: "创建客户失败" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getAuthorizedUser("outbound:manage");
    if (!session) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const ids = Array.isArray(body?.ids)
      ? body.ids.map((id: unknown) => String(id || "").trim()).filter(Boolean)
      : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "请选择要删除的客户" }, { status: 400 });
    }

    const idSet = new Set(ids);
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { shippingAddresses: true },
    });
    const customers = normalizeCustomerAddresses(user?.shippingAddresses);
    const nextCustomers = customers.filter((customer) => !idSet.has(customer.id));
    const deletedCount = customers.length - nextCustomers.length;

    if (deletedCount === 0) {
      return NextResponse.json({ error: "客户不存在" }, { status: 404 });
    }

    await prisma.user.update({
      where: { id: session.id },
      data: { shippingAddresses: nextCustomers as unknown as Prisma.InputJsonValue },
    });

    return NextResponse.json({ success: true, deletedCount });
  } catch (error) {
    console.error("Failed to batch delete customers:", error);
    return NextResponse.json({ error: "批量删除客户失败" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getAuthorizedUser("outbound:manage");
    if (!session) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const ids = Array.isArray(body?.ids)
      ? body.ids.map((id: unknown) => String(id || "").trim()).filter(Boolean)
      : [];
    const group = String(body?.group || "").trim();

    if (ids.length === 0) {
      return NextResponse.json({ error: "请选择要分组的客户" }, { status: 400 });
    }

    const idSet = new Set(ids);
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { shippingAddresses: true },
    });
    const customers = normalizeCustomerAddresses(user?.shippingAddresses);
    let updatedCount = 0;
    const now = new Date().toISOString();
    const nextCustomers = customers.map((customer) => {
      if (!idSet.has(customer.id)) {
        return customer;
      }
      updatedCount += 1;
      return {
        ...customer,
        group,
        updatedAt: now,
      };
    });

    if (updatedCount === 0) {
      return NextResponse.json({ error: "客户不存在" }, { status: 404 });
    }

    await prisma.user.update({
      where: { id: session.id },
      data: { shippingAddresses: nextCustomers as unknown as Prisma.InputJsonValue },
    });

    return NextResponse.json({ success: true, updatedCount });
  } catch (error) {
    console.error("Failed to batch group customers:", error);
    return NextResponse.json({ error: "批量设置分组失败" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getAuthorizedUser("outbound:manage");
    if (!session) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const rows = Array.isArray(body?.customers) ? body.customers : [];
    if (rows.length === 0) {
      return NextResponse.json({ error: "导入数据不能为空" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { shippingAddresses: true },
    });
    const customers = normalizeCustomerAddresses(user?.shippingAddresses);
    const nextCustomers = [...customers];
    const now = new Date().toISOString();
    const errors: string[] = [];
    let created = 0;
    let skipped = 0;

    for (const row of rows as Record<string, unknown>[]) {
      const contactName = getStringValue(row, ["客户姓名", "姓名", "收件人", "联系人", "contactName", "name", "recipientName"]);
      const contactPhone = getStringValue(row, ["手机号", "电话", "客户电话", "联系电话", "contactPhone", "phone", "recipientPhone"]);
      const address = getStringValue(row, ["完整地址", "客户地址", "地址", "收件地址", "detailAddress", "address", "recipientAddress"]);
      const group = getStringValue(row, ["客户分组", "分组", "组别", "group", "customerGroup"]);

      if (!contactName || !contactPhone || !address) {
        skipped += 1;
        if (errors.length < 20) {
          errors.push(`缺少必要字段：${contactName || "未填写姓名"} / ${contactPhone || "未填写手机号"} / ${address || "未填写地址"}`);
        }
        continue;
      }

      const duplicate = nextCustomers.some((customer) =>
        isSameCustomerAddress(customer, { contactName, contactPhone, address })
      );
      if (duplicate) {
        skipped += 1;
        continue;
      }

      nextCustomers.push({
        id: `customer_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        label: [contactName, contactPhone ? contactPhone.slice(-4) : ""].filter(Boolean).join(" "),
        address,
        detailAddress: address,
        contactName,
        contactPhone,
        group,
        isDefault: nextCustomers.length === 0,
        source: "manual",
        createdAt: now,
        updatedAt: now,
        lastUsedAt: now,
        usageCount: 0,
      });
      created += 1;
    }

    if (created > 0) {
      await prisma.user.update({
        where: { id: session.id },
        data: { shippingAddresses: nextCustomers as unknown as Prisma.InputJsonValue },
      });
    }

    return NextResponse.json({ success: true, created, skipped, errors });
  } catch (error) {
    console.error("Failed to import customers:", error);
    return NextResponse.json({ error: "客户导入失败" }, { status: 500 });
  }
}
