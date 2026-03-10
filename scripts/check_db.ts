import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const itemId = "cmmkt0g36001zu08cf33xs89o";
  const item = await prisma.storeOpeningItem.findUnique({
    where: { id: itemId }
  });
  console.log("Item check:", !!item, item);
}

main().catch(console.error).finally(() => prisma.$disconnect());
