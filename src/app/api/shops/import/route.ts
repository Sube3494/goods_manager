import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";

type RawShopRow = Record<string, unknown>;

function normalizeColumnKey(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/[：:]/g, "")
    .replace(/[\s_-]+/g, "")
    .toLowerCase()
    .trim();
}

function getStringValue(row: RawShopRow, keys: string[]) {
  const normalizedRowEntries = Object.entries(row).map(([key, value]) => [
    normalizeColumnKey(key),
    value,
  ] as const);

  for (const key of keys) {
    const directValue = row[key];
    if (directValue !== undefined && directValue !== null && String(directValue).trim()) {
      return String(directValue).trim();
    }
  }

  for (const key of keys) {
    const normalizedKey = normalizeColumnKey(key);
    const matchedEntry = normalizedRowEntries.find(([entryKey, value]) => {
      return entryKey === normalizedKey && value !== undefined && value !== null && String(value).trim();
    });
    if (matchedEntry) {
      return String(matchedEntry[1]).trim();
    }
  }

  return "";
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, "").trim().toLowerCase();
}

function simplifyShopName(name: string) {
  if (!name) return "";
  const match = name.match(/[\(（](.*)[\)）]$/);
  if (match && match[1]) return match[1];
  const parts = name
    .replace(/^私人订制轻奢礼品店/, "")
    .split(/[^\u4e00-\u9fa5a-zA-Z0-9]+/)
    .filter(Boolean);
  const lastPart = parts.pop() || "";
  if (lastPart === "店" && parts.length > 0) {
    return parts.pop() + lastPart;
  }
  return lastPart.replace(/(生日礼物|儿童玩具|滋补燕窝|礼品店)/g, "").trim() || name;
}

export async function POST(request: Request) {
  try {
    const user = await getAuthorizedUser("logistics:manage");
    if (!user || !user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { shops } = await request.json();
    if (!Array.isArray(shops) || shops.length === 0) {
      return NextResponse.json({ error: "导入数据不能为空" }, { status: 400 });
    }

    const existingShops = await prisma.shop.findMany({
      where: user.role === "SUPER_ADMIN" ? {} : { userId: user.id },
      select: { name: true, address: true, externalId: true },
    });

    const existingExternalIds = new Set(
      existingShops.map((s) => s.externalId).filter(Boolean)
    );
    const existingKeys = new Set(
      existingShops.map((shop) => `${normalizeText(shop.name)}::${normalizeText(shop.address || "")}`)
    );

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];
    const createdShops: Array<{ id: string; name: string; address: string }> = [];

    for (const row of shops as RawShopRow[]) {
      const name = getStringValue(row, ["门店名称", "店铺名称", "网点名称", "名称", "门店", "shopName", "shop_name"]);
      const address = getStringValue(row, ["详细地址", "门店地址", "地址", "address", "shop_address"]);
      const province = getStringValue(row, ["省份", "省", "province"]);
      const city = getStringValue(row, ["城市", "市", "city"]);
      const poiId = getStringValue(row, [
        "POI_ID",
        "POI ID",
        "POIID",
        "POT_ID",
        "poi_id",
        "poiId",
        "poi id",
        "poi-id",
        "poi",
        "poi编号",
        "poi号",
      ]);

      if (!name || !address || !poiId) {
        skipped += 1;
        if (errors.length < 20) {
          errors.push(`缺少必要字段：${name || "未填写名称"} / ${poiId || "未填写POI_ID"} / ${address || "未填写地址"}`);
        }
        continue;
      }

      const cleanedName = simplifyShopName(name);

      // 优先用 POI_ID 做去重，更精准
      if (poiId && existingExternalIds.has(poiId)) {
        skipped += 1;
        continue;
      }
      const dedupeKey = `${normalizeText(cleanedName)}::${normalizeText(address)}`;
      if (existingKeys.has(dedupeKey)) {
        skipped += 1;
        continue;
      }
      existingKeys.add(dedupeKey);

      const createdShop = await prisma.shop.create({
        data: {
          name: cleanedName,
          address,
          province,
          city,
          latitude: null,
          longitude: null,
          isSource: true,
          externalId: poiId,
          remark: null,
          userId: user.id,
        },
      });

      existingExternalIds.add(poiId);
      created += 1;
      createdShops.push({
        id: createdShop.id,
        name: createdShop.name,
        address: createdShop.address || address,
      });
    }

    return NextResponse.json({
      created,
      skipped,
      errors,
      shops: createdShops,
    });
  } catch (error) {
    console.error("Failed to import shops:", error);
    return NextResponse.json({ error: "店铺导入失败" }, { status: 500 });
  }
}
