import prisma from "@/lib/prisma";
import { callAutoPickCommand, refreshAutoPickOrderFromPlugin } from "@/lib/autoPickOrders";

const AUTO_COMPLETE_RETRY_DELAY_MS = 15 * 1000;
const AUTO_COMPLETE_STALE_LOCK_MS = 2 * 60 * 1000;
const AUTO_COMPLETE_RECONCILE_MS = 60 * 1000;

type AutoCompleteSchedulerState = {
  timer?: NodeJS.Timeout;
  reconcileTimer?: NodeJS.Timeout;
  started?: boolean;
  running?: boolean;
  nextJobId?: string | null;
  nextDueAt?: number | null;
};

function getSchedulerState() {
  const scoped = globalThis as typeof globalThis & {
    autoPickAutoCompleteScheduler?: AutoCompleteSchedulerState;
  };

  if (!scoped.autoPickAutoCompleteScheduler) {
    scoped.autoPickAutoCompleteScheduler = {
      started: false,
      running: false,
      nextJobId: null,
      nextDueAt: null,
    };
  }

  return scoped.autoPickAutoCompleteScheduler;
}

function isTerminalStatus(status?: string | null) {
  const text = String(status || "").trim();
  const normalized = text.toLowerCase();

  const completed = text.includes("已完成")
    || normalized === "done"
    || normalized === "completed"
    || normalized === "complete"
    || normalized === "finished"
    || normalized === "finish";

  const cancelled = text.includes("取消")
    || text.includes("退款")
    || text.includes("关闭")
    || normalized === "cancel"
    || normalized === "cancelled"
    || normalized === "canceled"
    || normalized === "closed"
    || normalized === "refund";

  return completed || cancelled;
}

async function clearSchedulerTimer() {
  const state = getSchedulerState();
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = undefined;
  }
  state.nextJobId = null;
  state.nextDueAt = null;
}

export async function scheduleNextAutoCompleteJob() {
  const state = getSchedulerState();
  await clearSchedulerTimer();

  const nextJob = await prisma.autoPickAutoCompleteJob.findFirst({
    where: {
      status: "pending",
    },
    orderBy: {
      dueAt: "asc",
    },
    select: {
      id: true,
      dueAt: true,
    },
  });

  if (!nextJob) {
    return;
  }

  const delay = Math.max(0, nextJob.dueAt.getTime() - Date.now());
  state.nextJobId = nextJob.id;
  state.nextDueAt = nextJob.dueAt.getTime();
  state.timer = setTimeout(() => {
    void runAutoCompleteSchedulerCycle();
  }, delay);
}

async function markJobSuccess(jobId: string, orderId: string, userId: string, sourceId: string, platform: string, orderNo: string, orderTime: Date) {
  await prisma.$transaction([
    prisma.autoPickOrder.update({
      where: { id: orderId },
      data: {
        status: "已完成",
        autoCompleteAt: null,
        lastSyncedAt: new Date(),
      },
    }),
    prisma.autoPickAutoCompleteJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        completedAt: new Date(),
        lockedAt: null,
        lastError: null,
      },
    }),
  ]);

  void refreshAutoPickOrderFromPlugin(userId, {
    id: sourceId,
    platform,
    orderNo,
    orderTime,
  }).catch((refreshError) => {
    console.error("Failed to refresh auto-pick order after auto complete:", refreshError);
  });
}

async function markJobRetry(jobId: string, error: string) {
  await prisma.autoPickAutoCompleteJob.update({
    where: { id: jobId },
    data: {
      status: "pending",
      dueAt: new Date(Date.now() + AUTO_COMPLETE_RETRY_DELAY_MS),
      lockedAt: null,
      lastError: error.slice(0, 1000),
    },
  });
}

async function markJobCancelled(jobId: string, orderId: string, error?: string) {
  await prisma.$transaction([
    prisma.autoPickOrder.update({
      where: { id: orderId },
      data: {
        autoCompleteAt: null,
      },
    }),
    prisma.autoPickAutoCompleteJob.update({
      where: { id: jobId },
      data: {
        status: "cancelled",
        lockedAt: null,
        lastError: error?.slice(0, 1000) || null,
      },
    }),
  ]);
}

async function tryLockJob(jobId: string, staleBefore: Date) {
  const locked = await prisma.autoPickAutoCompleteJob.updateMany({
    where: {
      id: jobId,
      OR: [
        { status: "pending" },
        {
          status: "running",
          lockedAt: {
            lte: staleBefore,
          },
        },
      ],
    },
    data: {
      status: "running",
      lockedAt: new Date(),
      lastAttemptAt: new Date(),
      attempts: {
        increment: 1,
      },
    },
  });

  return locked.count > 0;
}

export async function processDueAutoCompleteJobs(limit = 20) {
  const staleBefore = new Date(Date.now() - AUTO_COMPLETE_STALE_LOCK_MS);
  const dueJobs = await prisma.autoPickAutoCompleteJob.findMany({
    where: {
      OR: [
        {
          status: "pending",
          dueAt: {
            lte: new Date(),
          },
        },
        {
          status: "running",
          lockedAt: {
            lte: staleBefore,
          },
        },
      ],
    },
    include: {
      order: {
        select: {
          id: true,
          userId: true,
          status: true,
          platform: true,
          dailyPlatformSequence: true,
          orderNo: true,
          sourceId: true,
          logisticId: true,
          orderTime: true,
        },
      },
    },
    orderBy: {
      dueAt: "asc",
    },
    take: limit,
  });

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const job of dueJobs) {
    const locked = await tryLockJob(job.id, staleBefore);
    if (!locked) {
      continue;
    }

    const order = job.order;
    if (!order || isTerminalStatus(order.status)) {
      await markJobCancelled(job.id, job.orderId, "order-terminal-before-auto-complete");
      results.push({ id: job.id, ok: true });
      continue;
    }

    try {
      const result = await callAutoPickCommand(order.userId, "/complete-delivery", {
        platform: order.platform,
        dailyPlatformSequence: order.dailyPlatformSequence,
        orderNo: order.orderNo,
        sourceId: order.sourceId,
        logisticId: order.logisticId,
      });

      if (result.ok) {
        await markJobSuccess(job.id, order.id, order.userId, order.sourceId, order.platform, order.orderNo, order.orderTime);
        results.push({ id: job.id, ok: true });
      } else {
        await markJobRetry(job.id, JSON.stringify(result.data));
        results.push({ id: job.id, ok: false, error: JSON.stringify(result.data) });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await markJobRetry(job.id, message);
      results.push({ id: job.id, ok: false, error: message });
    }
  }

  const succeeded = results.filter((item) => item.ok).length;
  const failed = results.filter((item) => !item.ok).length;

  return {
    processed: results.length,
    succeeded,
    failed,
    results,
  };
}

export async function runAutoCompleteSchedulerCycle() {
  const state = getSchedulerState();
  if (state.running) {
    return;
  }

  state.running = true;
  try {
    const result = await processDueAutoCompleteJobs();
    if (result.processed > 0) {
      console.log(`[auto-pick-auto-complete] processed=${result.processed} ok=${result.succeeded} fail=${result.failed}`);
    }
  } catch (error) {
    console.error("Scheduled auto-pick auto-complete failed:", error);
  } finally {
    state.running = false;
    await scheduleNextAutoCompleteJob();
  }
}

export async function ensureAutoCompleteJob(params: { userId: string; orderId: string; dueAt: Date }) {
  await prisma.autoPickAutoCompleteJob.upsert({
    where: {
      orderId: params.orderId,
    },
    create: {
      userId: params.userId,
      orderId: params.orderId,
      dueAt: params.dueAt,
      status: "pending",
    },
    update: {
      userId: params.userId,
      dueAt: params.dueAt,
      status: "pending",
      lockedAt: null,
      completedAt: null,
      lastError: null,
    },
  });

  await scheduleNextAutoCompleteJob();
}

export async function cancelAutoCompleteJob(orderId: string, reason = "manual-cancel") {
  await prisma.autoPickAutoCompleteJob.updateMany({
    where: {
      orderId,
      status: {
        in: ["pending", "running"],
      },
    },
    data: {
      status: "cancelled",
      lockedAt: null,
      lastError: reason.slice(0, 1000),
    },
  });

  await scheduleNextAutoCompleteJob();
}

export async function startAutoCompleteScheduler() {
  const state = getSchedulerState();
  if (state.started) {
    return;
  }

  state.started = true;
  await scheduleNextAutoCompleteJob();

  if (!state.reconcileTimer) {
    state.reconcileTimer = setInterval(() => {
      void runAutoCompleteSchedulerCycle();
    }, AUTO_COMPLETE_RECONCILE_MS);
  }
}
