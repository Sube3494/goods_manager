UPDATE "PurchaseOrder"
SET "status" = 'Confirmed'
WHERE "status" = 'Draft';

ALTER TABLE "PurchaseOrder"
ALTER COLUMN "status" SET DEFAULT 'Confirmed';
