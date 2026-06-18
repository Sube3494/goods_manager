CREATE TABLE IF NOT EXISTS "OutboundOrderItem" (
  "id" TEXT NOT NULL,
  "outboundOrderId" TEXT NOT NULL,
  "productId" TEXT,
  "shopProductId" TEXT,
  "quantity" INTEGER NOT NULL,
  "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "costSnapshot" JSONB,
  CONSTRAINT "OutboundOrderItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OutboundOrderItem"
ADD COLUMN IF NOT EXISTS "productId" TEXT;

ALTER TABLE "OutboundOrderItem"
ADD COLUMN IF NOT EXISTS "shopProductId" TEXT;

ALTER TABLE "OutboundOrderItem"
ADD COLUMN IF NOT EXISTS "quantity" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "OutboundOrderItem"
ADD COLUMN IF NOT EXISTS "price" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "OutboundOrderItem"
ADD COLUMN IF NOT EXISTS "costSnapshot" JSONB;

CREATE INDEX IF NOT EXISTS "OutboundOrderItem_productId_idx" ON "OutboundOrderItem"("productId");
CREATE INDEX IF NOT EXISTS "OutboundOrderItem_shopProductId_idx" ON "OutboundOrderItem"("shopProductId");
CREATE INDEX IF NOT EXISTS "OutboundOrderItem_outboundOrderId_idx" ON "OutboundOrderItem"("outboundOrderId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'OutboundOrderItem_outboundOrderId_fkey'
      AND table_name = 'OutboundOrderItem'
  ) THEN
    ALTER TABLE "OutboundOrderItem"
    ADD CONSTRAINT "OutboundOrderItem_outboundOrderId_fkey"
    FOREIGN KEY ("outboundOrderId") REFERENCES "OutboundOrder"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'OutboundOrderItem_productId_fkey'
      AND table_name = 'OutboundOrderItem'
  ) THEN
    ALTER TABLE "OutboundOrderItem"
    ADD CONSTRAINT "OutboundOrderItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'OutboundOrderItem_shopProductId_fkey'
      AND table_name = 'OutboundOrderItem'
  ) THEN
    ALTER TABLE "OutboundOrderItem"
    ADD CONSTRAINT "OutboundOrderItem_shopProductId_fkey"
    FOREIGN KEY ("shopProductId") REFERENCES "ShopProduct"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
