import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { getAddressDetail } from "@/lib/addressBook";
import { buildShopDedupeKey, findMatchingShopRecord, normalizeExternalId, normalizeShopAddress, normalizeShopName, isShopNameMatch } from "@/lib/shopIdentity";

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
        addressBookId: String(item?.id || `address-${index}`),
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
      let existing = findMatchingShopRecord(existingShops, addr);

      // 合并对齐扫描：如果通过 addressBookId 匹配到了已绑定的新店，但数据库还残留有同名的空 addressBookId 老店，在此进行商品数据合并与清理，防止分裂
      if (existing) {
        const unboundOldShops = existingShops.filter(
          (s) => s.id !== existing!.id && !s.addressBookId && 
          (isShopNameMatch(s.name, existing!.name) || 
           (s.name && existing!.name && s.name.length >= 2 && existing!.name.length >= 2 && s.name.substring(0, 2) === existing!.name.substring(0, 2)))
        );
        for (const oldShop of unboundOldShops) {
          const oldProdCount = await prisma.shopProduct.count({ where: { shopId: oldShop.id } });
          if (oldProdCount > 0) {
            const oldProducts = await prisma.shopProduct.findMany({ where: { shopId: oldShop.id } });
            for (const item of oldProducts) {
              const hasConflict = await prisma.shopProduct.findFirst({
                where: {
                  shopId: existing.id,
                  OR: [
                    item.sku ? { sku: item.sku } : {},
                    item.jdSkuId ? { jdSkuId: item.jdSkuId } : {},
                    { productName: item.productName }
                  ].filter(o => Object.keys(o).length > 0)
                }
              });
              if (hasConflict) {
                await prisma.productBatch.updateMany({ where: { shopProductId: item.id }, data: { shopProductId: hasConflict.id } });
                await prisma.purchaseOrderItem.updateMany({ where: { shopProductId: item.id }, data: { shopProductId: hasConflict.id } });
                await prisma.shopProduct.delete({ where: { id: item.id } });
              } else {
                await prisma.shopProduct.update({ where: { id: item.id }, data: { shopId: existing.id } });
              }
            }
          }
          try {
            await prisma.shop.delete({ where: { id: oldShop.id } });
            const oIdx = existingShops.findIndex((s) => s.id === oldShop.id);
            if (oIdx >= 0) existingShops.splice(oIdx, 1);
          } catch (e) {
            console.error(`Failed to delete duplicated old shop ${oldShop.id}:`, e);
          }
        }
      }

      // 如果未匹配到，则进行【兜底合并保护】：寻找未绑定的同名老店或该用户唯一的未绑定老店，直接复用以避免新建分裂
      if (!existing) {
        const unboundShops = existingShops.filter((s) => !s.addressBookId && !touchedShopIds.has(s.id));
        if (unboundShops.length > 0) {
          // 优先寻找店名相似的老店
          let candidate = unboundShops.find(
            (s) => isShopNameMatch(s.name, addr.name) || 
            (s.name && addr.name && s.name.length >= 2 && addr.name.length >= 2 && s.name.substring(0, 2) === addr.name.substring(0, 2))
          );
          
          // 如果没有名字相似的，但只剩唯一一个未绑定的老店铺，且它有商品，说明是被修改了简称的那个老店
          if (!candidate && unboundShops.length === 1) {
            const hasProducts = await prisma.shopProduct.count({ where: { shopId: unboundShops[0].id } }) > 0;
            if (hasProducts) {
              candidate = unboundShops[0];
            }
          }
          
          if (candidate) {
            existing = candidate;
          }
        }
      }

      if (existing) {
        const shouldUpdate =
          String(existing.name || "").trim() !== addr.name ||
          String(existing.address || "").trim() !== addr.address ||
          String(existing.externalId || "").trim() !== String(addr.externalId || "").trim() ||
          existing.addressBookId !== addr.addressBookId ||
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
              addressBookId: addr.addressBookId,
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
          addressBookId: addr.addressBookId,
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
