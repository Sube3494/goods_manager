import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { buildShopDedupeKey, findMatchingShopRecord, normalizeExternalId, normalizeShopAddress, normalizeShopName } from "@/lib/shopIdentity";

export async function PUT(request: Request, context: { params: { id: string } }) {
  try {
    const user = await getAuthorizedUser("logistics:manage");
    if (!user || !user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const { name, externalId, address, province, city, latitude, longitude, isSource, contactName, contactPhone, remark } = body;
    const normalizedExternalId = normalizeExternalId(externalId);
    const normalizedName = normalizeShopName(name);
    const normalizedAddress = normalizeShopAddress(address);

    if (!normalizedName || !normalizedExternalId || !normalizedAddress) {
      return NextResponse.json({ error: "Missing required shop fields" }, { status: 400 });
    }

    const existingShop = await prisma.shop.findUnique({
      where: { id },
    });

    if (!existingShop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    if (existingShop.userId !== user.id && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const siblingShops = await prisma.shop.findMany({
      where: {
        id: { not: id },
        userId: existingShop.userId,
      },
      select: { id: true, name: true, address: true, externalId: true },
    });
    const duplicateShop = findMatchingShopRecord(siblingShops, {
      externalId: normalizedExternalId,
      name: normalizedName,
      address: normalizedAddress,
    });

    if (duplicateShop) {
      const duplicateReason = normalizeExternalId(duplicateShop.externalId) === normalizedExternalId
        ? "POI_ID"
        : "店铺名称+地址";
      return NextResponse.json({ error: `${duplicateReason} 已存在：${duplicateShop.name}` }, { status: 409 });
    }

    const updatedShop = await prisma.shop.update({
      where: { id },
      data: {
        name: normalizedName,
        dedupeKey: buildShopDedupeKey({ name: normalizedName, address: normalizedAddress }) || null,
        externalId: normalizedExternalId,
        address: normalizedAddress,
        province,
        city,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        isSource,
        contactName,
        contactPhone,
        remark,
      },
    });

    return NextResponse.json({ shop: updatedShop });
  } catch (error) {
    console.error("Failed to update shop:", error);
    return NextResponse.json({ error: "Failed to update shop" }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: { id: string } }) {
  try {
    const user = await getAuthorizedUser("logistics:manage");
    if (!user || !user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    const existingShop = await prisma.shop.findUnique({
      where: { id },
    });

    if (!existingShop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    if (existingShop.userId !== user.id && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.shop.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete shop:", error);
    return NextResponse.json({ error: "Failed to delete shop" }, { status: 500 });
  }
}
