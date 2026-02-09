import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting migration...')
  
  // Update PO-IMP- records
  const impResult = await prisma.purchaseOrder.updateMany({
    where: {
      id: {
        startsWith: 'PO-IMP-'
      }
    },
    data: {
      type: 'Inbound'
    }
  })
  console.log(`Updated ${impResult.count} import records.`)

  // Update PO-INIT- records
  const initResult = await prisma.purchaseOrder.updateMany({
    where: {
      id: {
        startsWith: 'PO-INIT-'
      }
    },
    data: {
      type: 'Inbound'
    }
  })
  console.log(`Updated ${initResult.count} initialization records.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
