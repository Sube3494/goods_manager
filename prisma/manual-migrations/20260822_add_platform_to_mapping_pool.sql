ALTER TABLE "MeituanImportBatch"
  ADD COLUMN IF NOT EXISTS "platform" TEXT NOT NULL DEFAULT 'meituan';

ALTER TABLE "MeituanImportItem"
  ADD COLUMN IF NOT EXISTS "platform" TEXT NOT NULL DEFAULT 'meituan';

CREATE INDEX IF NOT EXISTS "MeituanImportBatch_userId_platform_idx"
  ON "MeituanImportBatch" ("userId", "platform");

CREATE INDEX IF NOT EXISTS "MeituanImportItem_userId_platform_meituanSkuId_idx"
  ON "MeituanImportItem" ("userId", "platform", "meituanSkuId");
