ALTER TABLE "AutoPickOrder"
  ADD COLUMN IF NOT EXISTS "customerPhoneTail" TEXT,
  ADD COLUMN IF NOT EXISTS "customerAddressKey" TEXT,
  ADD COLUMN IF NOT EXISTS "customerShopKey" TEXT,
  ADD COLUMN IF NOT EXISTS "customerIdentityKey" TEXT,
  ADD COLUMN IF NOT EXISTS "customerIdentityVersion" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "AutoPickOrder_userId_customerIdentityVersion_idx"
  ON "AutoPickOrder"("userId", "customerIdentityVersion");
CREATE INDEX IF NOT EXISTS "AutoPickOrder_userId_customerIdentityKey_orderTime_idx"
  ON "AutoPickOrder"("userId", "customerIdentityKey", "orderTime");
