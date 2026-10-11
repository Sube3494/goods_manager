import { PrismaClient } from "../prisma/generated-client";
import { mkdirSync, writeFileSync } from "node:fs";

const prisma = new PrismaClient();
const fields = { meituan: "meituanSkuId", jd: "jdSkuId", taobao: "taobaoSkuId", doudian: "doudianSkuId" } as const;
const split = (value: string | null) => [...new Set((value || "").split(/[\s,，;；、]+/).filter(Boolean))];

async function main() {
  const shops = await prisma.shopProduct.findMany({
    select: { id: true, shopId: true, productId: true, sku: true, meituanSkuId: true, jdSkuId: true, taobaoSkuId: true, doudianSkuId: true },
  });
  const mappings = await prisma.productMeituanSku.findMany({ select: { productId: true, meituanSkuId: true } });
  const duplicateIds: unknown[] = [];
  const owners = new Map<string, string>();
  const sharedMappingLeaks: unknown[] = [];
  for (const item of shops) {
    for (const [platform, field] of Object.entries(fields)) {
      for (const id of split(item[field])) {
        const key = `${item.shopId}:${platform}:${id}`;
        const previous = owners.get(key);
        if (previous) duplicateIds.push({ shopId: item.shopId, platform, platformId: id, shopProductIds: [previous, item.id] });
        owners.set(key, item.id);
      }
    }
    const localIds = split(item.meituanSkuId);
    const foreignIds = mappings.filter((mapping) => mapping.productId === item.productId && !localIds.includes(mapping.meituanSkuId)).map((mapping) => mapping.meituanSkuId);
    if (foreignIds.length) sharedMappingLeaks.push({ shopProductId: item.id, shopId: item.shopId, sku: item.sku, localIds, formerlyDisplayedIds: foreignIds });
  }
  mkdirSync("tmp", { recursive: true });
  writeFileSync("tmp/platform-id-audit.json", JSON.stringify({ duplicateIds, sharedMappingLeaks }, null, 2));
  console.log(JSON.stringify({ shopProducts: shops.length, duplicateIds: duplicateIds.length, sharedMappingLeaks: sharedMappingLeaks.length, report: "tmp/platform-id-audit.json" }));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
