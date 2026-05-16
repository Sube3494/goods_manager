CREATE TABLE IF NOT EXISTS "UserDeviceSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "deviceType" TEXT NOT NULL,
  "deviceLabel" TEXT NOT NULL,
  "browser" TEXT,
  "os" TEXT,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "UserDeviceSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserDeviceSession_sessionId_key" ON "UserDeviceSession"("sessionId");
CREATE INDEX IF NOT EXISTS "UserDeviceSession_userId_lastSeenAt_idx" ON "UserDeviceSession"("userId", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "UserDeviceSession_endedAt_lastSeenAt_idx" ON "UserDeviceSession"("endedAt", "lastSeenAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'UserDeviceSession_userId_fkey'
      AND table_name = 'UserDeviceSession'
  ) THEN
    ALTER TABLE "UserDeviceSession"
    ADD CONSTRAINT "UserDeviceSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
