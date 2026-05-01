import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { getAddressDetail } from "@/lib/addressBook";
import { buildShopDedupeKey, findMatchingShopRecord, normalizeExternalId, normalizeShopAddress, normalizeShopName } from "@/lib/shopIdentity";

function sameNullableNumber(left: number | null | undefined, right: number | null | undefined) {
  const normalizedLeft = Number.isFinite(Number(left)) ? Number(left) : null;
  const normalizedRight = Number.isFinite(Number(right)) ? Number(right) : null;
  return normalizedLeft === normalizedRight;
}

type ShippingAddress = {
  id?: string;
  label?: string;
  address?: string;
  detailAddress?: string;
  isDefault?: boolean;
  externalId?: string;
  longitude?: number;
  latitude?: number;
};

// GET: 获取店铺列表，默认仅返回当前用户自己的数据
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthorizedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const scope = request.nextUrl.searchParams.get("scope");
    const source = request.nextUrl.searchParams.get("source");
    const shouldSyncProfileAddresses = source === "shipping-addresses";
    const canViewAllShops = user.role === "SUPER_ADMIN" && scope === "all";

    if (canViewAllShops) {
      const shops = await prisma.shop.findMany({
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json({ shops, source: "shop-table", needsAddress: false });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { shippingAddresses: true },
    });

    const existingShops = await prisma.shop.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    if (!shouldSyncProfileAddresses) {
      return NextResponse.json({
        shops: existingShops,
        source: "shop-table",
        needsAddress: existingShops.length === 0,
      });
    }

    const shippingAddresses = Array.isArray(dbUser?.shippingAddresses)
      ? (dbUser.shippingAddresses as ShippingAddress[])
      : [];

    const normalizedAddresses = shippingAddresses
      .map((item, index) => ({
        id: String(item?.id || `address-${index}`),
        name: normalizeShopName(item?.label),
        address: normalizeShopAddress(getAddressDetail(item)),
        isDefault: Boolean(item?.isDefault),
        externalId: normalizeExternalId(item?.externalId),
        longitude: Number.isFinite(Number(item?.longitude)) ? Number(item?.longitude) : null,
        latitude: Number.isFinite(Number(item?.latitude)) ? Number(item?.latitude) : null,
      }))
      .filter((item) => item.name && item.address);

    if (normalizedAddresses.length === 0) {
      return NextResponse.json({
        shops: existingShops,
        source: "shop-table",
        needsAddress: true,
      });
    }

    const createdShops: typeof existingShops = [];
    const touchedShopIds = new Set<string>();

    for (const addr of normalizedAddresses) {
      const existing = findMatchingShopRecord(existingShops, addr);
      if (existing) {
        const shouldUpdate =
          String(existing.name || "").trim() !== addr.name ||
          String(existing.address || "").trim() !== addr.address ||
          String(existing.externalId || "").trim() !== String(addr.externalId || "").trim() ||
          !sameNullableNumber(existing.longitude, addr.longitude) ||
          !sameNullableNumber(existing.latitude, addr.latitude);

        if (shouldUpdate) {
          const updated = await prisma.shop.update({
            where: { id: existing.id },
            data: {
              name: addr.name,
              address: addr.address,
              dedupeKey: buildShopDedupeKey(addr) || null,
              externalId: addr.externalId || null,
              longitude: addr.longitude,
              latitude: addr.latitude,
            },
          });
          const index = existingShops.findIndex((shop) => shop.id === updated.id);
          if (index >= 0) {
            existingShops[index] = updated;
          }
        }
        touchedShopIds.add(existing.id);
        continue;
      }

      const created = await prisma.shop.create({
        data: {
          userId: user.id,
          name: addr.name,
          address: addr.address,
          dedupeKey: buildShopDedupeKey(addr) || null,
          externalId: addr.externalId || null,
          longitude: addr.longitude,
          latitude: addr.latitude,
          isSource: true,
          remark: "自动从店铺地址同步",
        },
      });

      existingShops.unshift(created);
      createdShops.push(created);
      touchedShopIds.add(created.id);
    }

    const shops = source === "shipping-addresses"
      ? existingShops
          .filter((shop) => touchedShopIds.has(shop.id))
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      : await prisma.shop.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
        });

    return NextResponse.json({
      shops,
      source: "shipping-addresses",
      needsAddress: false,
      syncedCount: createdShops.length,
    });
  } catch (error) {
    console.error("Failed to fetch shops:", error);
    return NextResponse.json({ error: "Failed to fetch shops" }, { status: 500 });
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
    const { name, externalId, address, province, city, latitude, longitude, isSource, contactName, contactPhone, remark } = body;
    const normalizedExternalId = normalizeExternalId(externalId);
    const normalizedName = normalizeShopName(name);
    const normalizedAddress = normalizeShopAddress(address);

    if (!normalizedName || !normalizedExternalId || !normalizedAddress) {
      return NextResponse.json({ error: "Missing required shop fields" }, { status: 400 });
    }

    const existingShops = await prisma.shop.findMany({
      where: { userId: user.id },
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

    const newShop = await prisma.shop.create({
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
      },
    });

    return NextResponse.json({ shop: newShop });
  } catch (error) {
    console.error("Failed to create shop:", error);
    return NextResponse.json({ error: "Failed to create shop" }, { status: 500 });
  }
}
