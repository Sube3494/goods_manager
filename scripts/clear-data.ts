import { PrismaClient } from '../prisma/generated-client';

const prisma = new PrismaClient();

async function main() {
  console.log('⚠️  Starting data clearance...');
  console.log('   Preserving: Users, Workspaces, Settings, Whitelists');
  
  // 1. Delete Line Items (Child records)
  console.log('1. Deleting Order Items...');
  await prisma.brushOrderItem.deleteMany({});
  await prisma.purchaseOrderItem.deleteMany({});
  await prisma.outboundOrderItem.deleteMany({});
  
  // 2. Delete Orders & Transactions
  console.log('2. Deleting Orders and Submissions...');
  await prisma.brushOrder.deleteMany({});
  await prisma.purchaseOrder.deleteMany({});
  await prisma.outboundOrder.deleteMany({});
  await prisma.gallerySubmission.deleteMany({});
  
  // 3. Delete Media & Products
  console.log('3. Deleting Gallery Items and Products...');
  await prisma.galleryItem.deleteMany({});
  await prisma.product.deleteMany({});
  
  // 4. Delete Master Data
  console.log('4. Deleting Categories and Suppliers...');
  // Note: Suppliers and Categories might be referenced by other things, ensuring order
  await prisma.category.deleteMany({});
  await prisma.supplier.deleteMany({});
  
  // 5. Delete Verification Codes (Optional cleanup)
  await prisma.verificationCode.deleteMany({});

  console.log('✅ Data clearance complete.');
  
  // Verify
  const userCount = await prisma.user.count();
  const productCount = await prisma.product.count();
  console.log(`\nVerification:\n- Users remaining: ${userCount}\n- Products remaining: ${productCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
