import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { getAddressDetail } from "@/lib/addressBook";
import prisma from "@/lib/prisma";
import { fetchMaiyatianShippingShopsByCookie, getAutoPickIntegrationConfigByUserId } from "@/lib/autoPickOrders";

export const dynamic = "force-dynamic";

type ShippingAddress = {
  id?: string;
  label?: string;
  address?: string;
  detailAddress?: string;
  isDefault?: boolean;
};

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const saved = await getAutoPickIntegrationConfigByUserId(session.id);
    const cookie = String(body?.maiyatianCookie ?? saved.maiyatianCookie ?? "").trim();

    if (!cookie) {
      return NextResponse.json({ error: "请先填写麦芽田 Cookie" }, { status: 400 });
    }

    const [shops, user] = await Promise.all([
      fetchMaiyatianShippingShopsByCookie(cookie),
      prisma.user.findUnique({
        where: { id: session.id },
        select: { shippingAddresses: true },
      }),
    ]);

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

    return NextResponse.json({
      shops,
      localShops,
    });
  } catch (error) {
    console.error("Failed to fetch Maiyatian shops:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "读取麦芽田门店失败",
    }, { status: 500 });
  }
}
