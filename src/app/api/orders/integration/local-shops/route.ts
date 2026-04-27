import { NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { getAddressDetail } from "@/lib/addressBook";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

type ShippingAddress = {
  id?: string;
  label?: string;
  address?: string;
  detailAddress?: string;
  isDefault?: boolean;
};

export async function GET() {
  const session = await getAuthorizedUser("order:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { shippingAddresses: true },
    });

    const localShops = Array.isArray(user?.shippingAddresses)
      ? (user.shippingAddresses as ShippingAddress[])
          .map((item, index) => ({
            id: String(item?.id || `shipping-${index}`),
            name: String(item?.label || "").trim(),
            address: getAddressDetail(item),
            isDefault: Boolean(item?.isDefault),
          }))
          .filter((item) => item.name && item.address)
      : [];

    return NextResponse.json({ shops: localShops });
  } catch (error) {
    console.error("Failed to fetch integration local shops:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "读取系统地址失败",
    }, { status: 500 });
  }
}
