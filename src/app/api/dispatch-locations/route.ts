import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { normalizeDispatchGroupId, canAccessDispatchGroup } from "@/lib/dispatchAddressBook";
import { buildShopDedupeKey, findMatchingShopRecord, normalizeExternalId, normalizeShopAddress, normalizeShopName } from "@/lib/shopIdentity";

export async function GET(request: Request) {
  const user = await getAuthorizedUser("logistics:manage");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const groups = await prisma.dispatchGroup.findMany({ where: { userId: user.id }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } });
    const selection = new URL(request.url).searchParams.get("groupId") || "all";
    const groupId = normalizeDispatchGroupId(selection);
    if (!await canAccessDispatchGroup(user, groupId)) return NextResponse.json({ error: "无权访问此分组" }, { status: 403 });
    const shops = await prisma.dispatchLocation.findMany({ where: { userId: user.id, ...(selection === "all" ? {} : { groupId }) }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ shops, groups });
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
    const groupId = normalizeDispatchGroupId(body.groupId);
    if (!await canAccessDispatchGroup(user, groupId)) return NextResponse.json({ error: "无权访问此分组" }, { status: 403 });
    const { name, externalId, address, province, city, latitude, longitude, isSource, contactName, contactPhone, remark } = body;
    const normalizedExternalId = normalizeExternalId(externalId);
    const normalizedName = normalizeShopName(name);
    const normalizedAddress = normalizeShopAddress(address);

    if (!normalizedName || !normalizedExternalId || !normalizedAddress) {
      return NextResponse.json({ error: "Missing required shop fields" }, { status: 400 });
    }

    const existingShops = await prisma.dispatchLocation.findMany({
      where: { userId: user.id, groupId },
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
        groupId,
        scopeKey: groupId || "ungrouped",
      },
    });

    return NextResponse.json({ shop: newShop });
  } catch (error) {
    console.error("Failed to create shop:", error);
    return NextResponse.json({ error: "Failed to create shop" }, { status: 500 });
  }
}
