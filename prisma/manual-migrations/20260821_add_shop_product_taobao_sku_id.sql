ALTER TABLE "ShopProduct"
  ADD COLUMN IF NOT EXISTS "taobaoSkuId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "ShopProduct_shopId_taobaoSkuId_key"
  ON "ShopProduct" ("shopId", "taobaoSkuId");
