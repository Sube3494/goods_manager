import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { getAddressDetail, isAddressDisabled } from "@/lib/addressBook";
import prisma from "@/lib/prisma";
import { fetchMaiyatianShippingShopsByCookie, getAutoPickIntegrationConfigByUserId } from "@/lib/autoPickOrders";

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

export async function GET(_request: NextRequest) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const saved = await getAutoPickIntegrationConfigByUserId(session.id);
    const cookie = String(saved.maiyatianCookie || "").trim();

    let shops: Array<{ id: string; name: string; address?: string | null; cityName?: string | null }> = [];

    if (cookie) {
      try {
        shops = await fetchMaiyatianShippingShopsByCookie(cookie);
      } catch (err) {
        console.warn("实时读取麦芽田门店失败，尝试使用保存的映射:", err);
      }
    }

    // 如果 Cookie 没拉到或没填，从映射备份中还原麦芽田门店选项
    if (shops.length === 0 && Array.isArray(saved.maiyatianShopMappings)) {
      shops = saved.maiyatianShopMappings
        .map((m) => ({
          id: String(m.maiyatianShopId || "").trim(),
          name: String(m.maiyatianShopName || "").trim(),
        }))
        .filter((item) => item.name);
    }

    return NextResponse.json({
      shops,
      maiyatianShopMappings: saved.maiyatianShopMappings || [],
    });
  } catch (error) {
    console.error("Failed to fetch Maiyatian shops via GET:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "读取麦芽田门店失败",
    }, { status: 500 });
  }
}

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

    const [shops, user, dbShops] = await Promise.all([
      fetchMaiyatianShippingShopsByCookie(cookie),
      prisma.user.findUnique({
        where: { id: session.id },
        select: { shippingAddresses: true },
      }),
      prisma.shop.findMany({
        where: { userId: session.id },
        select: { id: true, addressBookId: true, libraryId: true },
      }),
    ]);

    const localShops = Array.isArray(user?.shippingAddresses)
      ? (user.shippingAddresses as ShippingAddress[])
          .filter((item) => !isAddressDisabled(item))
          .map((item, index) => {
            const addressBookId = String(item?.id || `shipping-${index}`);
            const dbShop = dbShops.find((shop) => shop.addressBookId === addressBookId);
            return {
              id: dbShop ? dbShop.id : addressBookId,
              name: String(item?.label || "").trim(),
              address: getAddressDetail(item),
              isDefault: Boolean(item?.isDefault),
              libraryId: dbShop?.libraryId || null,
            };
          })
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
