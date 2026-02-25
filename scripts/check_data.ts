/*
 * @Date: 2026-02-26 00:56:01
 * @Author: Sube
 * @FilePath: check_data.ts
 * @LastEditTime: 2026-02-26 01:46:35
 * @Description: 
 */
import { PrismaClient } from '../prisma/generated-client';
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.brushOrder.count();
  console.log('Total BrushOrders in DB:', count);

  const sample = await prisma.brushOrder.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: {
        workspace: true
    }
  });
  console.log('Last 5 orders:', JSON.stringify(sample, null, 2));

  const workspace = await prisma.workspace.findFirst();
  console.log('Available Workspace:', workspace);
}

main().finally(() => prisma.$disconnect());
