import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";

function normalizeExternalId(value: unknown) {
  return String(value || "").replace(/\s+/g, "").trim();
}

type ShippingAddress = {
  id?: string;
  label?: string;
  address?: string;
  isDefault?: boolean;
};

// GET: 获取店铺列表，默认仅返回当前用户自己的数据
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthorizedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const scope = request.nextUrl.searchParams.get("scope");
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

    const shippingAddresses = Array.isArray(dbUser?.shippingAddresses)
      ? (dbUser.shippingAddresses as ShippingAddress[])
      : [];

    const normalizedAddresses = shippingAddresses
      .map((item, index) => ({
        id: String(item?.id || `address-${index}`),
        name: String(item?.label || "").trim(),
        address: String(item?.address || "").trim(),
        isDefault: Boolean(item?.isDefault),
      }))
      .filter((item) => item.name && item.address);

    if (normalizedAddresses.length === 0) {
      return NextResponse.json({ shops: [], source: "shipping-addresses", needsAddress: true });
    }

    const existingShops = await prisma.shop.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    const existingByName = new Map(existingShops.map((shop) => [shop.name.trim(), shop]));
    const createdShops: typeof existingShops = [];

    for (const addr of normalizedAddresses) {
      if (existingByName.has(addr.name)) {
        continue;
      }

      const created = await prisma.shop.create({
        data: {
          userId: user.id,
          name: addr.name,
          address: addr.address,
          isSource: true,
          remark: "自动从店铺地址同步",
        },
      });

      existingByName.set(created.name.trim(), created);
      createdShops.push(created);
    }

    const shops = await prisma.shop.findMany({
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

    if (!name || !normalizedExternalId || !address) {
      return NextResponse.json({ error: "Missing required shop fields" }, { status: 400 });
    }

    const duplicateShop = await prisma.shop.findFirst({
      where: {
        userId: user.id,
        externalId: normalizedExternalId,
      },
      select: { id: true, name: true },
    });

    if (duplicateShop) {
      return NextResponse.json({ error: `POI_ID 已存在：${duplicateShop.name}` }, { status: 409 });
    }

    const newShop = await prisma.shop.create({
      data: {
        name,
        externalId: normalizedExternalId,
        address,
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
