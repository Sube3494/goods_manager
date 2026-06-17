import prisma from "@/lib/prisma";

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
const DEFAULT_TOLERANCE_MINUTES = 20;

type PurchaseDateBackfillLogger = Pick<Console, "log" | "error">;

export type PurchaseDateBackfillOptions = {
  write?: boolean;
  logger?: PurchaseDateBackfillLogger;
  userId?: string | null;
  orderId?: string | null;
  from?: string | null;
  to?: string | null;
  mode?: "strict" | "all-before-fix";
  toleranceMinutes?: number;
  includeTypes?: string[] | null;
  limit?: number | null;
};

type CandidateOrder = Awaited<ReturnType<typeof loadPurchaseOrders>>[number];

type CandidateMatch = {
  anchor: "createdAt" | "updatedAt";
  diffMs: number;
  deltaFromTargetMs: number;
};

type CandidateInspection = {
  order: CandidateOrder;
  match: CandidateMatch | null;
  nextDate: Date;
};

function parseArgsDate(value: string | null | undefined, field: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`无效的 ${field}: ${value}`);
  }
  return parsed;
}

async function loadPurchaseOrders(options: PurchaseDateBackfillOptions) {
  const from = parseArgsDate(options.from, "from");
  const to = parseArgsDate(options.to, "to");
  const includeTypes = options.includeTypes?.filter(Boolean) || null;
  const limit = options.limit && options.limit > 0 ? options.limit : undefined;

  return prisma.purchaseOrder.findMany({
    where: {
      ...(options.userId ? { userId: options.userId } : {}),
      ...(options.orderId ? { id: options.orderId } : {}),
      ...(includeTypes ? { type: { in: includeTypes } } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
    select: {
      id: true,
      userId: true,
      type: true,
      status: true,
      shopName: true,
      note: true,
      date: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      createdAt: "asc",
    },
    ...(limit ? { take: limit } : {}),
  });
}

function inspectStrictCandidate(order: CandidateOrder, toleranceMs: number): CandidateMatch | null {
  const dateMs = order.date.getTime();
  const createdDiff = dateMs - order.createdAt.getTime();
  const updatedDiff = dateMs - order.updatedAt.getTime();
  const createdDelta = Math.abs(createdDiff - EIGHT_HOURS_MS);
  const updatedDelta = Math.abs(updatedDiff - EIGHT_HOURS_MS);

  if (createdDelta > toleranceMs && updatedDelta > toleranceMs) {
    return null;
  }

  if (createdDelta <= updatedDelta) {
    return {
      anchor: "createdAt",
      diffMs: createdDiff,
      deltaFromTargetMs: createdDelta,
    };
  }

  return {
    anchor: "updatedAt",
    diffMs: updatedDiff,
    deltaFromTargetMs: updatedDelta,
  };
}

function inspectOrder(order: CandidateOrder, options: PurchaseDateBackfillOptions): CandidateInspection | null {
  const mode = options.mode || "strict";
  const toleranceMinutes = options.toleranceMinutes ?? DEFAULT_TOLERANCE_MINUTES;
  const toleranceMs = toleranceMinutes * 60 * 1000;

  if (mode === "strict") {
    const match = inspectStrictCandidate(order, toleranceMs);
    if (!match) {
      return null;
    }

    return {
      order,
      match,
      nextDate: new Date(order.date.getTime() - EIGHT_HOURS_MS),
    };
  }

  const beforeFixUpperBound = parseArgsDate(options.to, "to");
  if (beforeFixUpperBound && order.createdAt.getTime() > beforeFixUpperBound.getTime()) {
    return null;
  }

  return {
    order,
    match: null,
    nextDate: new Date(order.date.getTime() - EIGHT_HOURS_MS),
  };
}

function formatDeltaMs(deltaMs: number) {
  const sign = deltaMs >= 0 ? "+" : "-";
  const totalMinutes = Math.round(Math.abs(deltaMs) / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatUtc(date: Date) {
  return date.toISOString();
}

export async function runPurchaseDateBackfill(options: PurchaseDateBackfillOptions = {}) {
  const logger = options.logger || console;
  const write = Boolean(options.write);
  const mode = options.mode || "strict";
  const toleranceMinutes = options.toleranceMinutes ?? DEFAULT_TOLERANCE_MINUTES;
  const includeTypes = options.includeTypes?.filter(Boolean) || null;

  logger.log(`开始${write ? "正式修复" : "dry-run"}采购单时间，模式: ${mode}`);
  logger.log(`- toleranceMinutes: ${toleranceMinutes}`);
  if (options.userId) logger.log(`- userId: ${options.userId}`);
  if (options.orderId) logger.log(`- orderId: ${options.orderId}`);
  if (options.from) logger.log(`- from(createdAt): ${options.from}`);
  if (options.to) logger.log(`- to(createdAt): ${options.to}`);
  if (includeTypes?.length) logger.log(`- includeTypes: ${includeTypes.join(", ")}`);
  if (options.limit) logger.log(`- limit: ${options.limit}`);

  const orders = await loadPurchaseOrders(options);
  logger.log(`共扫描 ${orders.length} 张采购单`);

  const candidates = orders
    .map((order) => inspectOrder(order, options))
    .filter((item): item is CandidateInspection => Boolean(item));

  logger.log(`命中 ${candidates.length} 张待修复采购单`);

  candidates.slice(0, 50).forEach(({ order, match, nextDate }) => {
    const matchInfo = match
      ? ` | ${match.anchor} diff ${formatDeltaMs(match.diffMs)} | offset drift ${Math.round(match.deltaFromTargetMs / 60000)}m`
      : "";
    logger.log(
      `${order.id} | ${order.type} | ${order.shopName || "未命名店铺"} | ${formatUtc(order.date)} -> ${formatUtc(nextDate)}${matchInfo}`
    );
  });

  if (candidates.length > 50) {
    logger.log(`... 其余 ${candidates.length - 50} 张未展开`);
  }

  if (!write) {
    logger.log("\n使用 `bun scripts/backfill-purchase-order-dates.ts --write` 执行正式修复。");
    return {
      scanned: orders.length,
      matched: candidates.length,
      updated: 0,
    };
  }

  let updated = 0;
  for (const candidate of candidates) {
    await prisma.purchaseOrder.update({
      where: { id: candidate.order.id },
      data: { date: candidate.nextDate },
    });
    updated += 1;
  }

  logger.log(`已更新 ${updated} 张采购单时间`);

  return {
    scanned: orders.length,
    matched: candidates.length,
    updated,
  };
}
