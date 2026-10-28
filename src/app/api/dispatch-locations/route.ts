import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { getDispatchLibraries, canAccessDispatchLibrary } from "@/lib/dispatchAddressBook";
import { buildShopDedupeKey, findMatchingShopRecord, normalizeExternalId, normalizeShopAddress, normalizeShopName } from "@/lib/shopIdentity";

export async function GET(request: Request) {
  const user = await getAuthorizedUser("logistics:manage");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const libraries = await getDispatchLibraries(user);
    const libraryId = new URL(request.url).searchParams.get("libraryId") || libraries[0]?.id;
    if (!libraryId) return NextResponse.json({ shops: [], libraries, libraryId: null });
    if (!libraries.some((library) => library.id === libraryId)) return NextResponse.json({ error: "无权访问此调货库" }, { status: 403 });
    const shops = await prisma.dispatchLocation.findMany({ where: { libraryId }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ shops, libraries, libraryId });
  } catch (error) {
    console.error("Failed to fetch dispatch locations:", error);
    return NextResponse.json({ error: "调货网点加载失败" }, { status: 500 });
  }
}

// POST: 创建新店铺
export async function POST(request: Request) {
  try {
    const user = await getAuthorizedUser("logistics:manage");
    if (!user) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const libraryId = String(body.libraryId || "").trim();
    if (!await canAccessDispatchLibrary(user, libraryId)) return NextResponse.json({ error: "无权访问此调货库" }, { status: 403 });
    const { name, externalId, address, province, city, latitude, longitude, isSource, contactName, contactPhone, remark } = body;
    const normalizedExternalId = normalizeExternalId(externalId);
    const normalizedName = normalizeShopName(name);
    const normalizedAddress = normalizeShopAddress(address);

    if (!normalizedName || !normalizedExternalId || !normalizedAddress) {
      return NextResponse.json({ error: "Missing required shop fields" }, { status: 400 });
    }

    const existingShops = await prisma.dispatchLocation.findMany({
      where: { libraryId },
      select: { id: true, name: true, address: true, externalId: true },
    });
    const duplicateShop = findMatchingShopRecord(existingShops, {
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

    const newShop = await prisma.dispatchLocation.create({
      data: {
        name: normalizedName,
        dedupeKey: buildShopDedupeKey({ name: normalizedName, address: normalizedAddress }) || null,
        externalId: normalizedExternalId,
        address: normalizedAddress,
        province,
        city,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        isSource: isSource ?? true,
        contactName,
        contactPhone,
        remark,
        userId: user.id,
        libraryId,
      },
    });

    return NextResponse.json({ shop: newShop });
  } catch (error) {
    console.error("Failed to create shop:", error);
    return NextResponse.json({ error: "Failed to create shop" }, { status: 500 });
  }
}
