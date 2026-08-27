ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "doudianSkuId" TEXT;

ALTER TABLE "ShopProduct" ADD COLUMN IF NOT EXISTS "doudianSkuId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "ShopProduct_shopId_doudianSkuId_key"
ON "ShopProduct"("shopId", "doudianSkuId")
WHERE "doudianSkuId" IS NOT NULL;
