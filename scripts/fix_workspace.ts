import { PrismaClient } from '../prisma/generated-client';
const prisma = new PrismaClient();

async function main() {
  const workspace = await prisma.workspace.findFirst();
  if (!workspace) {
    console.error('No workspace found!');
    return;
  }

  const result = await prisma.brushOrder.updateMany({
    where: { workspaceId: null },
    data: { workspaceId: workspace.id }
  });

  console.log(`Successfully updated ${result.count} records with workspaceId: ${workspace.id}`);
}

main().finally(() => prisma.$disconnect());
