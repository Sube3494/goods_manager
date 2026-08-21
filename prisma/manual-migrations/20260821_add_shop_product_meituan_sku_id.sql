ALTER TABLE "ShopProduct" ADD COLUMN IF NOT EXISTS "meituanSkuId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "ShopProduct_shopId_meituanSkuId_key"
  ON "ShopProduct"("shopId", "meituanSkuId")
  WHERE "meituanSkuId" IS NOT NULL;
