ALTER TABLE "AutoPickOrderItem" ADD COLUMN IF NOT EXISTS "platformSkuId" TEXT;

CREATE INDEX IF NOT EXISTS "AutoPickOrderItem_platformSkuId_idx" ON "AutoPickOrderItem"("platformSkuId");
