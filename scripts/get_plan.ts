
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const plans = await prisma.brushOrderPlan.findMany({
    take: 1,
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true }
  })
  console.log('Latest Plan:', JSON.stringify(plans, null, 2))
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect())
