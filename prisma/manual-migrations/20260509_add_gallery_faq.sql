CREATE TABLE IF NOT EXISTS "GalleryFaq" (
  "id" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "answer" TEXT NOT NULL DEFAULT '',
  "productIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "userId" TEXT,

  CONSTRAINT "GalleryFaq_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "GalleryFaq_userId_idx" ON "GalleryFaq"("userId");
CREATE INDEX IF NOT EXISTS "GalleryFaq_updatedAt_idx" ON "GalleryFaq"("updatedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'GalleryFaq_userId_fkey'
  ) THEN
    ALTER TABLE "GalleryFaq"
      ADD CONSTRAINT "GalleryFaq_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
