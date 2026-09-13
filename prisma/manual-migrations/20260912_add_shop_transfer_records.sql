-- CreateTable ShopTransferRecord
CREATE TABLE IF NOT EXISTS "ShopTransferRecord" (
    "id" TEXT NOT NULL,
    "sourceShopId" TEXT NOT NULL,
    "targetShopId" TEXT NOT NULL,
    "sourceShopProductId" TEXT,
    "targetShopProductId" TEXT,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL,
    "shippingFee" DOUBLE PRECISION DEFAULT 0,
    "sourceCostPrice" DOUBLE PRECISION DEFAULT 0,
    "targetCostPrice" DOUBLE PRECISION DEFAULT 0,
    "remark" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopTransferRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX IF NOT EXISTS "ShopTransferRecord_sourceShopId_createdAt_idx" ON "ShopTransferRecord"("sourceShopId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ShopTransferRecord_targetShopId_createdAt_idx" ON "ShopTransferRecord"("targetShopId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ShopTransferRecord_sourceShopProductId_idx" ON "ShopTransferRecord"("sourceShopProductId");
CREATE INDEX IF NOT EXISTS "ShopTransferRecord_targetShopProductId_idx" ON "ShopTransferRecord"("targetShopProductId");
CREATE INDEX IF NOT EXISTS "ShopTransferRecord_userId_createdAt_idx" ON "ShopTransferRecord"("userId", "createdAt" DESC);
