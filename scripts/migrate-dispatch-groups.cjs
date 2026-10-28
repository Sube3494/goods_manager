const { PrismaClient } = require("../prisma/generated-client");

// Run before db push so the old library column is preserved until every existing
// location has been assigned to an independent, owner-specific group.
async function migrateDispatchGroups(prisma) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(72702801)");
    const [table] = await tx.$queryRawUnsafe(`SELECT to_regclass('public."DispatchLocation"') IS NOT NULL AS present`);
    if (!table.present) return { migrated: false };
    await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "DispatchGroup" (
      "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "name" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    await tx.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "DispatchGroup_userId_name_key" ON "DispatchGroup"("userId", "name")`);
    await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DispatchGroup_userId_idx" ON "DispatchGroup"("userId")`);
    await tx.$executeRawUnsafe(`ALTER TABLE "DispatchLocation" ADD COLUMN IF NOT EXISTS "groupId" TEXT`);
    await tx.$executeRawUnsafe(`ALTER TABLE "DispatchLocation" ADD COLUMN IF NOT EXISTS "scopeKey" TEXT NOT NULL DEFAULT 'ungrouped'`);
    const [column] = await tx.$queryRawUnsafe(`SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='DispatchLocation' AND column_name='libraryId') AS present`);
    if (column.present) {
      await tx.$executeRawUnsafe(`INSERT INTO "DispatchGroup" ("id", "userId", "name")
        SELECT DISTINCT 'legacy-dispatch:' || d."userId" || ':' || d."libraryId", d."userId",
          replace(COALESCE(l."name", '原网点分组'), '商品库', '网点')
        FROM "DispatchLocation" d LEFT JOIN "ProductLibrary" l ON l."id" = d."libraryId"
        WHERE d."libraryId" IS NOT NULL ON CONFLICT DO NOTHING`);
      await tx.$executeRawUnsafe(`UPDATE "DispatchLocation" d SET "groupId" = g."id"
        FROM "DispatchGroup" g, "ProductLibrary" l
        WHERE l."id" = d."libraryId" AND g."userId" = d."userId"
          AND g."name" = replace(l."name", '商品库', '网点') AND d."groupId" IS NULL`);
      await tx.$executeRawUnsafe(`ALTER TABLE "DispatchLocation" DROP COLUMN "libraryId"`);
    }
    await tx.$executeRawUnsafe(`UPDATE "DispatchLocation" SET "scopeKey" = COALESCE("groupId", 'ungrouped') WHERE "scopeKey" <> COALESCE("groupId", 'ungrouped')`);
    const [constraint] = await tx.$queryRawUnsafe(`SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='DispatchLocation_groupId_fkey' AND conrelid='"DispatchLocation"'::regclass) AS present`);
    if (!constraint.present) await tx.$executeRawUnsafe(`ALTER TABLE "DispatchLocation" ADD CONSTRAINT "DispatchLocation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "DispatchGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE`);
    await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DispatchLocation_groupId_idx" ON "DispatchLocation"("groupId")`);
    await tx.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "DispatchLocation_userId_scopeKey_externalId_key" ON "DispatchLocation"("userId", "scopeKey", "externalId")`);
    await tx.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "DispatchLocation_userId_scopeKey_dedupeKey_key" ON "DispatchLocation"("userId", "scopeKey", "dedupeKey")`);
    return { migrated: true };
  }, { timeout: 60000 });
}
module.exports = { migrateDispatchGroups };
if (require.main === module) {
  const prisma = new PrismaClient();
  migrateDispatchGroups(prisma).then((result) => console.log(JSON.stringify(result)))
    .catch((error) => { console.error("Dispatch group migration failed:", error.message); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
