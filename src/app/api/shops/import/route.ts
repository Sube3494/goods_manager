import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";

type RawShopRow = Record<string, unknown>;

function getStringValue(row: RawShopRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, "").trim().toLowerCase();
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
      select: { name: true, address: true },
    });

    const existingKeys = new Set(
      existingShops.map((shop) => `${normalizeText(shop.name)}::${normalizeText(shop.address || "")}`)
    );

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];
    const createdShops: Array<{ id: string; name: string; address: string }> = [];

    for (const row of shops as RawShopRow[]) {
      const name = getStringValue(row, ["门店名称", "店铺名称", "网点名称", "名称", "门店", "shopName"]);
      const address = getStringValue(row, ["详细地址", "门店地址", "地址", "address"]);
      const poiId = getStringValue(row, ["POI_ID", "POT_ID", "poi_id", "poiId"]);

      if (!name || !address) {
        skipped += 1;
        if (errors.length < 20) {
          errors.push(`缺少必要字段：${name || "未填写名称"} / ${address || "未填写地址"}`);
        }
        continue;
      }

      const dedupeKey = `${normalizeText(name)}::${normalizeText(address)}`;
      if (existingKeys.has(dedupeKey)) {
        skipped += 1;
        continue;
      }

      const createdShop = await prisma.shop.create({
        data: {
          name,
          address,
          latitude: null,
          longitude: null,
          isSource: true,
          remark: poiId ? `POI_ID:${poiId}` : null,
          userId: user.id,
        },
      });

      existingKeys.add(dedupeKey);
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
