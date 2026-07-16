import { NextResponse } from "next/server";
import { getFreshSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { getAddressDetail } from "@/lib/addressBook";

type ShippingAddressInput = {
  id?: string;
  label?: string;
  address?: string;
  detailAddress?: string;
  contactName?: string;
  contactPhone?: string;
  isDefault?: boolean;
  serviceFeeRate?: number;
  libraryId?: string;
};

export async function PATCH(req: Request) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, shippingAddresses, brushShops, brushCommissionBoostEnabled } = body;
    let normalizedShippingAddresses = shippingAddresses;

    if (Array.isArray(shippingAddresses)) {
      const missingLabel = shippingAddresses.find((item) => !String(item?.label || "").trim());
      if (missingLabel) {
        return NextResponse.json({ error: "门店简称为必填项" }, { status: 400 });
      }

      const missingAddress = shippingAddresses.find((item) => !getAddressDetail(item));
      if (missingAddress) {
        return NextResponse.json({ error: "门店详细地址为必填项" }, { status: 400 });
      }

      normalizedShippingAddresses = (shippingAddresses as ShippingAddressInput[]).map((item) => {
        const label = String(item.label || "").trim();
        const detailAddress = getAddressDetail(item);
        const normalizedItem = {
          ...item,
          label,
          detailAddress,
          contactName: String(item.contactName || "").trim(),
          contactPhone: String(item.contactPhone || "").trim(),
        };
        return {
          ...normalizedItem,
          address: detailAddress,
          longitude: undefined,
          latitude: undefined,
        };
      });
    }

    const canUseBrushSimulation = hasPermission(session, "brush:simulate");

    const updatedUser = await prisma.user.update({
      where: { id: session.id },
      data: { 
        name: name || undefined,
        shippingAddresses: normalizedShippingAddresses !== undefined ? normalizedShippingAddresses : undefined,
        brushShops: brushShops !== undefined ? brushShops : undefined,
        brushCommissionBoostEnabled: canUseBrushSimulation && typeof brushCommissionBoostEnabled === "boolean" ? brushCommissionBoostEnabled : undefined,
      }
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    console.error("Profile update failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
