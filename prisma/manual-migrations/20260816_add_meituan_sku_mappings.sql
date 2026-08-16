-- CreateTable ProductMeituanSku
CREATE TABLE IF NOT EXISTS "ProductMeituanSku" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "userId" TEXT,
    "meituanSkuId" TEXT NOT NULL,
    "meituanSpuId" TEXT,
    "meituanName" TEXT,
    "meituanSpec" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductMeituanSku_pkey" PRIMARY KEY ("id")
);

-- CreateTable MeituanImportBatch
CREATE TABLE IF NOT EXISTS "MeituanImportBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "fileName" TEXT NOT NULL,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeituanImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable MeituanImportItem
CREATE TABLE IF NOT EXISTS "MeituanImportItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "userId" TEXT,
    "meituanSkuId" TEXT NOT NULL,
    "meituanSpuId" TEXT,
    "name" TEXT NOT NULL,
    "spec" TEXT,
    "barcode" TEXT,
    "price" DOUBLE PRECISION,
    "imageUrl" TEXT,
    "rawData" JSONB,
    "suggestedProductId" TEXT,
    "suggestedReason" TEXT,
    "bindProductId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeituanImportItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX IF NOT EXISTS "ProductMeituanSku_productId_meituanSkuId_key" ON "ProductMeituanSku"("productId", "meituanSkuId");
CREATE UNIQUE INDEX IF NOT EXISTS "ProductMeituanSku_userId_meituanSkuId_key" ON "ProductMeituanSku"("userId", "meituanSkuId");
CREATE INDEX IF NOT EXISTS "ProductMeituanSku_productId_idx" ON "ProductMeituanSku"("productId");
CREATE INDEX IF NOT EXISTS "ProductMeituanSku_userId_meituanSkuId_idx" ON "ProductMeituanSku"("userId", "meituanSkuId");

CREATE INDEX IF NOT EXISTS "MeituanImportBatch_userId_idx" ON "MeituanImportBatch"("userId");
CREATE INDEX IF NOT EXISTS "MeituanImportBatch_createdAt_idx" ON "MeituanImportBatch"("createdAt");

CREATE INDEX IF NOT EXISTS "MeituanImportItem_batchId_idx" ON "MeituanImportItem"("batchId");
CREATE INDEX IF NOT EXISTS "MeituanImportItem_userId_meituanSkuId_idx" ON "MeituanImportItem"("userId", "meituanSkuId");
CREATE INDEX IF NOT EXISTS "MeituanImportItem_status_idx" ON "MeituanImportItem"("status");

-- AddForeignKey
ALTER TABLE "ProductMeituanSku" DROP CONSTRAINT IF EXISTS "ProductMeituanSku_productId_fkey";
ALTER TABLE "ProductMeituanSku" ADD CONSTRAINT "ProductMeituanSku_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductMeituanSku" DROP CONSTRAINT IF EXISTS "ProductMeituanSku_userId_fkey";
ALTER TABLE "ProductMeituanSku" ADD CONSTRAINT "ProductMeituanSku_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MeituanImportBatch" DROP CONSTRAINT IF EXISTS "MeituanImportBatch_userId_fkey";
ALTER TABLE "MeituanImportBatch" ADD CONSTRAINT "MeituanImportBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MeituanImportItem" DROP CONSTRAINT IF EXISTS "MeituanImportItem_batchId_fkey";
ALTER TABLE "MeituanImportItem" ADD CONSTRAINT "MeituanImportItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "MeituanImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MeituanImportItem" DROP CONSTRAINT IF EXISTS "MeituanImportItem_userId_fkey";
ALTER TABLE "MeituanImportItem" ADD CONSTRAINT "MeituanImportItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MeituanImportItem" DROP CONSTRAINT IF EXISTS "MeituanImportItem_bindProductId_fkey";
ALTER TABLE "MeituanImportItem" ADD CONSTRAINT "MeituanImportItem_bindProductId_fkey" FOREIGN KEY ("bindProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MeituanImportItem" DROP CONSTRAINT IF EXISTS "MeituanImportItem_suggestedProductId_fkey";
ALTER TABLE "MeituanImportItem" ADD CONSTRAINT "MeituanImportItem_suggestedProductId_fkey" FOREIGN KEY ("suggestedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
