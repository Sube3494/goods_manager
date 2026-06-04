import { NextResponse } from "next/server";
import { Prisma } from "../../../../prisma/generated-client";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { CustomerAddressItem, normalizeCustomerAddresses } from "@/lib/customerAddressBook";

function sortCustomers(customers: CustomerAddressItem[]) {
  return [...customers].sort((a, b) => {
    const lastA = a.lastUsedAt || a.updatedAt || a.createdAt || "";
    const lastB = b.lastUsedAt || b.updatedAt || b.createdAt || "";
    if (lastA !== lastB) return lastB.localeCompare(lastA);
    return (a.contactName || a.label).localeCompare(b.contactName || b.label, "zh-Hans-CN");
  });
}

export async function GET() {
  try {
    const session = await getAuthorizedUser("outbound:manage");
    if (!session) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { shippingAddresses: true },
    });

    return NextResponse.json(sortCustomers(normalizeCustomerAddresses(user?.shippingAddresses)));
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

    if (!contactName) {
      return NextResponse.json({ error: "客户姓名不能为空" }, { status: 400 });
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
      customer.contactName === contactName &&
      customer.contactPhone === contactPhone &&
      customer.address === address
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
