import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const batchId = "cmmkrsmrm0005g31487j1cp3a";
  const itemId = "cmmkt0g36001zu08cf33xs89o";

  console.log("--- DB DIAGNOSTICS ---");
  const batch = await prisma.storeOpeningBatch.findUnique({ where: { id: batchId } });
  console.log("Batch exists:", !!batch);

  const item = await prisma.storeOpeningItem.findUnique({ where: { id: itemId } });
  console.log("Item exists:", !!item);
  if (item) {
    console.log("Item batchId:", item.batchId);
    console.log("Item belongs to batch:", item.batchId === batchId);
  }

  const allItemsCount = await prisma.storeOpeningItem.count();
  console.log("Total items in DB:", allItemsCount);
}

main().catch(console.error).finally(() => prisma.$disconnect());
