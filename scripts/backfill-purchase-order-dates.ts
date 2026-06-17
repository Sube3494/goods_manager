import prisma from "../src/lib/prisma";
import { runPurchaseDateBackfill } from "../src/lib/purchaseDateBackfill";

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const current = argv[i];
    if (!current.startsWith("--")) continue;
    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args.set(key, "true");
      continue;
    }
    args.set(key, next);
    i++;
  }

  const includeTypesRaw = args.get("includeTypes") || "";

  return {
    write: args.get("write") === "true",
    userId: args.get("userId") || null,
    orderId: args.get("orderId") || null,
    from: args.get("from") || null,
    to: args.get("to") || null,
    mode: (args.get("mode") as "strict" | "shanghai-day-mismatch" | "all-before-fix" | undefined) || "strict",
    toleranceMinutes: args.get("toleranceMinutes") ? Number(args.get("toleranceMinutes")) : undefined,
    includeTypes: includeTypesRaw
      ? includeTypesRaw.split(",").map((item) => item.trim()).filter(Boolean)
      : null,
    limit: args.get("limit") ? Number(args.get("limit")) : null,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await runPurchaseDateBackfill(options);
}

main()
  .catch((error) => {
    console.error("采购单时间回填失败：", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
