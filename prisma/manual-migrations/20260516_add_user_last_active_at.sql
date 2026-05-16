ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "lastActiveAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_lastActiveAt_idx" ON "User"("lastActiveAt");
