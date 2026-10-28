-- Smart dispatch starts with an empty, independent address book.
-- Never copy Shop or profile shippingAddresses into these tables.
CREATE TABLE IF NOT EXISTS "DispatchLocation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "libraryId" TEXT NOT NULL REFERENCES "ProductLibrary"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "dedupeKey" TEXT,
  "externalId" TEXT,
  "province" TEXT,
  "city" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "isSource" BOOLEAN NOT NULL DEFAULT true,
  "contactName" TEXT,
  "contactPhone" TEXT,
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "DispatchLocation_userId_idx" ON "DispatchLocation"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "DispatchLocation_libraryId_externalId_key" ON "DispatchLocation"("libraryId", "externalId");
CREATE UNIQUE INDEX IF NOT EXISTS "DispatchLocation_libraryId_dedupeKey_key" ON "DispatchLocation"("libraryId", "dedupeKey");

CREATE INDEX IF NOT EXISTS "DispatchLocation_libraryId_idx" ON "DispatchLocation"("libraryId");
