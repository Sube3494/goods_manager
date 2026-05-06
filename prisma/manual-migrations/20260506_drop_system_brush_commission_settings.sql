ALTER TABLE "SystemSetting"
DROP COLUMN IF EXISTS "brushCommissionBoostEnabled",
DROP COLUMN IF EXISTS "brushCommissionRateMeituan",
DROP COLUMN IF EXISTS "brushCommissionRateTaobao",
DROP COLUMN IF EXISTS "brushCommissionRateJingdong";
