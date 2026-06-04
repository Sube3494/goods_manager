import { NextResponse } from "next/server";
import { Prisma } from "../../../../../prisma/generated-client";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { CustomerAddressItem, normalizeCustomerAddresses } from "@/lib/customerAddressBook";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedUser("outbound:manage");
    if (!session) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { id } = await params;
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
    const target = customers.find((customer) => customer.id === id);
    if (!target) {
      return NextResponse.json({ error: "客户不存在" }, { status: 404 });
    }

    const updated: CustomerAddressItem = {
      ...target,
      label: target.label,
      address,
      detailAddress: address,
      contactName,
      contactPhone,
      updatedAt: new Date().toISOString(),
    };
    const nextCustomers = customers.map((customer) => customer.id === id ? updated : customer);

    await prisma.user.update({
      where: { id: session.id },
      data: { shippingAddresses: nextCustomers as unknown as Prisma.InputJsonValue },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update customer:", error);
    return NextResponse.json({ error: "更新客户失败" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedUser("outbound:manage");
    if (!session) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { id } = await params;
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { shippingAddresses: true },
    });
    const customers = normalizeCustomerAddresses(user?.shippingAddresses);
    const nextCustomers = customers.filter((customer) => customer.id !== id);
    if (nextCustomers.length === customers.length) {
      return NextResponse.json({ error: "客户不存在" }, { status: 404 });
    }

    await prisma.user.update({
      where: { id: session.id },
      data: { shippingAddresses: nextCustomers as unknown as Prisma.InputJsonValue },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete customer:", error);
    return NextResponse.json({ error: "删除客户失败" }, { status: 500 });
  }
}
