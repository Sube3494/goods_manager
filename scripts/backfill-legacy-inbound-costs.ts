import prisma from "../src/lib/prisma";
import { runLegacyInboundCostBackfill } from "../src/lib/legacyInboundCostBackfill";

const WRITE_MODE = process.argv.includes("--write");

runLegacyInboundCostBackfill({ write: WRITE_MODE })
  .catch((error) => {
    console.error("历史入库成本回填失败：", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
