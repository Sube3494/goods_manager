import { NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { getAddressDetail, isAddressDisabled } from "@/lib/addressBook";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

type ShippingAddress = {
  id?: string;
  label?: string;
  address?: string;
  detailAddress?: string;
  isDefault?: boolean;
  disabled?: boolean;
  isDisabled?: boolean;
};

export async function GET(request: Request) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const requestedUserId = String(searchParams.get("userId") || "").trim();
  const isAdmin = Boolean(
    session.role === "SUPER_ADMIN" ||
    (session.role && String(session.role).includes("管理")) ||
    (Array.isArray(session.permissions) && (session.permissions.includes("*") || session.permissions.includes("members:manage") || session.permissions.includes("admin")))
  );
  const targetUserId = (isAdmin && requestedUserId) ? requestedUserId : session.id;

  try {
    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { shippingAddresses: true },
    });

    const addresses = Array.isArray(user?.shippingAddresses)
      ? (user.shippingAddresses as ShippingAddress[])
      : [];

    // 查询目标用户的所有本地店铺
    const dbShops = await prisma.shop.findMany({
      where: { userId: targetUserId },
      select: { id: true, addressBookId: true, libraryId: true }
    });

    const localShops = addresses
      .filter((item) => !isAddressDisabled(item))
      .map((item, index) => {
        const addressBookId = String(item?.id || `shipping-${index}`);
        const dbShop = dbShops.find((s) => s.addressBookId === addressBookId);
        
        return {
          id: dbShop ? dbShop.id : addressBookId, // 优先使用真实的 Shop ID，兜底使用地址库 ID
          name: String(item?.label || "").trim(),
          address: getAddressDetail(item),
          isDefault: Boolean(item?.isDefault),
          libraryId: dbShop?.libraryId || null,
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
