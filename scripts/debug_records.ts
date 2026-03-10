import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const items = await prisma.storeOpeningItem.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: { id: true, batchId: true, productName: true }
  });
  console.log("Latest items:", JSON.stringify(items, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
