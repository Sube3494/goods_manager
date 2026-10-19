-- 独立保存自动自配任务，避免被平台同步的 rawPayload 覆盖。
ALTER TABLE "AutoPickOrder" ADD COLUMN IF NOT EXISTS "queuedSelfDelivery" JSONB;
CREATE INDEX IF NOT EXISTS "AutoPickOrder_queuedSelfDelivery_status_idx"
  ON "AutoPickOrder" (("queuedSelfDelivery"->>'status'));
