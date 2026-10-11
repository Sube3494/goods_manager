CREATE TABLE IF NOT EXISTS "FixedPromotionExpense" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "shopName" TEXT NOT NULL,
  "effectiveDate" DATE NOT NULL,
  "amountMeituan" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "amountJingdong" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "amountTaobao" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "amountOther" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "FixedPromotionExpense_userId_shopName_effectiveDate_key"
  ON "FixedPromotionExpense"("userId", "shopName", "effectiveDate");
CREATE INDEX IF NOT EXISTS "FixedPromotionExpense_userId_effectiveDate_idx"
  ON "FixedPromotionExpense"("userId", "effectiveDate");
