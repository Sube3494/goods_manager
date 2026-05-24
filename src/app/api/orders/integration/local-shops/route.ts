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

    const addresses = Array.isArray(user?.shippingAddresses)
      ? (user.shippingAddresses as ShippingAddress[])
      : [];

    // 查询当前用户的所有本地店铺
    const dbShops = await prisma.shop.findMany({
      where: { userId: session.id },
      select: { id: true, addressBookId: true }
    });

    const localShops = addresses
      .map((item, index) => {
        const addressBookId = String(item?.id || `shipping-${index}`);
        const dbShop = dbShops.find((s) => s.addressBookId === addressBookId);
        
        return {
          id: dbShop ? dbShop.id : addressBookId, // 优先使用真实的 Shop ID，兜底使用地址库 ID
          name: String(item?.label || "").trim(),
          address: getAddressDetail(item),
          isDefault: Boolean(item?.isDefault),
        };
      })
      .filter((item) => item.name && item.address);

    return NextResponse.json({ shops: localShops });
  } catch (error) {
    console.error("Failed to fetch integration local shops:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "读取系统地址失败",
    }, { status: 500 });
  }
}
