import { NextResponse } from "next/server";
import { getFreshSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { SessionUser } from "@/lib/permissions";
import { canGeocodeAddress, geocodeAddress } from "@/lib/addressGeocode";
import { buildAddressDisplay, getAddressDetail, normalizeAddressItemParts } from "@/lib/addressBook";

type ShippingAddressInput = {
  id?: string;
  label?: string;
  address?: string;
  detailAddress?: string;
  contactName?: string;
  contactPhone?: string;
  isDefault?: boolean;
  externalId?: string;
  serviceFeeRate?: number;
  longitude?: number;
  latitude?: number;
};

export async function PATCH(req: Request) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, shippingAddresses, brushShops } = body;
    let normalizedShippingAddresses = shippingAddresses;

    if (Array.isArray(shippingAddresses)) {
      const missingLabel = shippingAddresses.find((item) => !String(item?.label || "").trim());
      if (missingLabel) {
        return NextResponse.json({ error: "门店简称为必填项" }, { status: 400 });
      }

      const missingExternalId = shippingAddresses.find((item) => !String(item?.externalId || "").trim());
      if (missingExternalId) {
        return NextResponse.json({ error: "门店ID为必填项" }, { status: 400 });
      }

      const missingAddress = shippingAddresses.find((item) => !getAddressDetail(item));
      if (missingAddress) {
        return NextResponse.json({ error: "门店详细地址为必填项" }, { status: 400 });
      }

      if (!canGeocodeAddress()) {
        return NextResponse.json({ error: "地址坐标服务未配置，暂时无法保存门店地址" }, { status: 500 });
      }

      try {
        normalizedShippingAddresses = await Promise.all(
          (shippingAddresses as ShippingAddressInput[]).map(async (item) => {
            const normalizedParts = normalizeAddressItemParts(item);
            const detailAddress = getAddressDetail(normalizedParts);
            const coord = await geocodeAddress(detailAddress);
            const normalizedItem = {
              ...item,
              label: String(item.label || "").trim(),
              detailAddress,
              contactName: normalizedParts.contactName,
              contactPhone: normalizedParts.contactPhone,
              externalId: String(item.externalId || "").trim(),
            };
            return {
              ...normalizedItem,
              address: buildAddressDisplay(normalizedItem),
              longitude: coord.longitude,
              latitude: coord.latitude,
            };
          })
        );
      } catch (error) {
        return NextResponse.json({
          error: error instanceof Error ? error.message : "地址坐标解析失败",
        }, { status: 400 });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: session.id },
      data: { 
        name: name || undefined,
        shippingAddresses: normalizedShippingAddresses !== undefined ? normalizedShippingAddresses : undefined,
        brushShops: brushShops !== undefined ? brushShops : undefined
      }
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    console.error("Profile update failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
