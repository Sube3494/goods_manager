CREATE TABLE IF NOT EXISTS "InventoryAdjustment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "purchaseOrderItemId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "beforeQuantity" INTEGER NOT NULL,
  "afterQuantity" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryAdjustment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryAdjustment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InventoryAdjustment_purchaseOrderItemId_fkey"
    FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "InventoryAdjustment_userId_createdAt_idx"
  ON "InventoryAdjustment"("userId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "InventoryAdjustment_purchaseOrderItemId_createdAt_idx"
  ON "InventoryAdjustment"("purchaseOrderItemId", "createdAt" DESC);
