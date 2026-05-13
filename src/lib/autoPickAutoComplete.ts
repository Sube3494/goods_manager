import prisma from "@/lib/prisma";
import { callAutoPickCommand, refreshAutoPickOrderFromPlugin, syncAutoOutboundFromCompletedAutoPickOrder, syncBrushOrderFromCompletedAutoPickOrder } from "@/lib/autoPickOrders";
import { emitAutoPickOrderEvent } from "@/lib/autoPickOrderEvents";
import { isAutoPickOrderAbnormalStatus, isAutoPickOrderCompletedStatus, isAutoPickOrderTerminalStatus } from "@/lib/autoPickOrderStatus";
import { AutoPickAutoCompleteJobStatus } from "../../prisma/generated-client";

const AUTO_COMPLETE_RETRY_DELAY_MS = 15 * 1000;
const AUTO_COMPLETE_STALE_LOCK_MS = 2 * 60 * 1000;
const AUTO_COMPLETE_RECONCILE_MS = 60 * 1000;
const AUTO_COMPLETE_MAX_ATTEMPTS = 20;
const JOB_PENDING = AutoPickAutoCompleteJobStatus.PENDING;
const JOB_RUNNING = AutoPickAutoCompleteJobStatus.RUNNING;
const JOB_COMPLETED = AutoPickAutoCompleteJobStatus.COMPLETED;
const JOB_CANCELLED = AutoPickAutoCompleteJobStatus.CANCELLED;
const JOB_FAILED = AutoPickAutoCompleteJobStatus.FAILED;

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
      status: JOB_PENDING,
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
        status: JOB_COMPLETED,
        completedAt: new Date(),
        lockedAt: null,
        lastError: null,
      },
    }),
  ]);
  emitAutoPickOrderEvent({
    type: "upsert",
    userId,
    orderId,
    orderNo,
    platform,
    at: new Date().toISOString(),
  });
  await syncBrushOrderFromCompletedAutoPickOrder(userId, orderId).catch((brushError) => {
    console.error("Failed to sync brush order after auto complete:", brushError);
  });
  await syncAutoOutboundFromCompletedAutoPickOrder(userId, orderId).catch((outboundError) => {
    console.error("Failed to auto-create outbound after auto complete:", outboundError);
  });

  void refreshAutoPickOrderFromPlugin(userId, {
    id: sourceId,
    platform,
    orderNo,
    orderTime,
  }).catch((refreshError) => {
    console.error("Failed to refresh auto-pick order after auto complete:", refreshError);
  });
}

function parseAutoCompleteErrorPayload(error: string) {
  const text = String(error || "").trim();
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function isPermanentAutoCompleteError(status: number | undefined, error: string) {
  if (status === 404) {
    return true;
  }

  const normalized = String(error || "").trim().toLowerCase();
  if (normalized === "not found") {
    return true;
  }

  const parsed = parseAutoCompleteErrorPayload(error);
  const message = String(parsed?.message || parsed?.error || "").trim().toLowerCase();
  return message === "not found";
}

function isMissingAutoPickCommandIdentity(sourceId: string | null | undefined, deliveryId?: string | null) {
  const normalizedSourceId = String(sourceId || "").trim();
  const normalizedDeliveryId = String(deliveryId || "").trim();
  return !normalizedSourceId || !normalizedDeliveryId || normalizedDeliveryId === "0";
}

async function markJobFailed(jobId: string, error: string) {
  const currentJob = await prisma.autoPickAutoCompleteJob.findUnique({
    where: { id: jobId },
    select: {
      orderId: true,
      order: {
        select: {
          userId: true,
          platform: true,
          orderNo: true,
        },
      },
    },
  });

  if (!currentJob) {
    return;
  }

  if (currentJob.order) {
    console.error("[auto-pick-auto-complete] job marked failed", {
      jobId,
      orderId: currentJob.orderId,
      orderNo: currentJob.order.orderNo,
      platform: currentJob.order.platform,
      error,
    });
  }

  await prisma.$transaction([
    prisma.autoPickOrder.update({
      where: { id: currentJob.orderId },
      data: {
        autoCompleteAt: null,
      },
    }),
    prisma.autoPickAutoCompleteJob.update({
      where: { id: jobId },
      data: {
        status: JOB_FAILED,
        lockedAt: null,
        lastError: error.slice(0, 1000),
      },
    }),
  ]);

  if (currentJob.order) {
    emitAutoPickOrderEvent({
      type: "upsert",
      userId: currentJob.order.userId,
      orderId: currentJob.orderId,
      orderNo: currentJob.order.orderNo,
      platform: currentJob.order.platform,
      at: new Date().toISOString(),
    });
  }
}

async function retryAutoCompleteAfterRefresh(job: {
  id: string;
  orderId: string;
  order: {
    id: string;
    userId: string;
    status: string | null;
    platform: string;
    dailyPlatformSequence: number;
    orderNo: string;
    sourceId: string;
    deliveryId: string | null;
    orderTime: Date;
  };
}) {
  const refreshedOrder = await refreshAutoPickOrderFromPlugin(job.order.userId, {
    id: job.order.sourceId,
    platform: job.order.platform,
    orderNo: job.order.orderNo,
    orderTime: job.order.orderTime,
  }).catch(() => null);

  if (!refreshedOrder) {
    return {
      recovered: false,
      error: "refresh-after-not-found-empty",
    } as const;
  }

  if (isAutoPickOrderCompletedStatus(refreshedOrder.status)) {
    await markJobSuccess(
      job.id,
      refreshedOrder.id,
      refreshedOrder.userId,
      refreshedOrder.sourceId,
      refreshedOrder.platform,
      refreshedOrder.orderNo,
      refreshedOrder.orderTime
    );
    return {
      recovered: true,
    } as const;
  }

  if (isAutoPickOrderTerminalStatus(refreshedOrder.status) || isAutoPickOrderAbnormalStatus(refreshedOrder.status)) {
    await markJobCancelled(job.id, refreshedOrder.id, `refresh-after-not-found:${refreshedOrder.status}`);
    return {
      recovered: true,
    } as const;
  }

  if (isMissingAutoPickCommandIdentity(refreshedOrder.sourceId, refreshedOrder.deliveryId)) {
    return {
      recovered: false,
      error: "refresh-after-not-found-missing-source-or-delivery-id",
    } as const;
  }

  const retryResult = await callAutoPickCommand(refreshedOrder.userId, "/complete-delivery", {
    platform: refreshedOrder.platform,
    dailyPlatformSequence: refreshedOrder.dailyPlatformSequence,
    orderNo: refreshedOrder.orderNo,
    sourceId: refreshedOrder.sourceId,
    deliveryId: refreshedOrder.deliveryId,
  });

  if (retryResult.ok) {
    await markJobSuccess(
      job.id,
      refreshedOrder.id,
      refreshedOrder.userId,
      refreshedOrder.sourceId,
      refreshedOrder.platform,
      refreshedOrder.orderNo,
      refreshedOrder.orderTime
    );
    return {
      recovered: true,
    } as const;
  }

  return {
    recovered: false,
    error: JSON.stringify(retryResult.data),
    status: retryResult.status,
  } as const;
}

async function markJobRetry(jobId: string, error: string) {
  const currentJob = await prisma.autoPickAutoCompleteJob.findUnique({
    where: { id: jobId },
    select: {
      attempts: true,
      orderId: true,
      order: {
        select: {
          userId: true,
          platform: true,
          orderNo: true,
        },
      },
    },
  });

  if (!currentJob) {
    return;
  }

  if (currentJob.order) {
    console.error("[auto-pick-auto-complete] job retry scheduled", {
      jobId,
      orderId: currentJob.orderId,
      orderNo: currentJob.order.orderNo,
      platform: currentJob.order.platform,
      attempts: currentJob.attempts || 0,
      error,
    });
  }

  if ((currentJob.attempts || 0) >= AUTO_COMPLETE_MAX_ATTEMPTS) {
    await markJobFailed(jobId, error);
    return;
  }

  await prisma.autoPickAutoCompleteJob.update({
    where: { id: jobId },
    data: {
      status: JOB_PENDING,
      dueAt: new Date(Date.now() + AUTO_COMPLETE_RETRY_DELAY_MS),
      lockedAt: null,
      lastError: error.slice(0, 1000),
    },
  });
}

async function markJobCancelled(jobId: string, orderId: string, error?: string) {
  const [order] = await prisma.$transaction([
    prisma.autoPickOrder.update({
      where: { id: orderId },
      data: {
        autoCompleteAt: null,
      },
      select: {
        id: true,
        userId: true,
        platform: true,
        orderNo: true,
      },
    }),
    prisma.autoPickAutoCompleteJob.update({
      where: { id: jobId },
      data: {
        status: JOB_CANCELLED,
        lockedAt: null,
        lastError: error?.slice(0, 1000) || null,
      },
    }),
  ]);
  emitAutoPickOrderEvent({
    type: "upsert",
    userId: order.userId,
    orderId: order.id,
    orderNo: order.orderNo,
    platform: order.platform,
    at: new Date().toISOString(),
  });
}

async function tryLockJob(jobId: string, staleBefore: Date) {
  const locked = await prisma.autoPickAutoCompleteJob.updateMany({
    where: {
      id: jobId,
      OR: [
        { status: JOB_PENDING },
        {
          status: JOB_RUNNING,
          lockedAt: {
            lte: staleBefore,
          },
        },
      ],
    },
    data: {
      status: JOB_RUNNING,
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
          status: JOB_PENDING,
          dueAt: {
            lte: new Date(),
          },
        },
        {
          status: JOB_RUNNING,
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
          deliveryId: true,
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
    if (!order || isAutoPickOrderTerminalStatus(order.status) || isAutoPickOrderAbnormalStatus(order.status)) {
      await markJobCancelled(job.id, job.orderId, "order-terminal-before-auto-complete");
      results.push({ id: job.id, ok: true });
      continue;
    }

    try {
      if (isMissingAutoPickCommandIdentity(order.sourceId, order.deliveryId)) {
        await markJobFailed(job.id, "missing-or-invalid-source-or-delivery-id");
        results.push({ id: job.id, ok: false, error: "missing-or-invalid-source-or-delivery-id" });
        continue;
      }

      const result = await callAutoPickCommand(order.userId, "/complete-delivery", {
        platform: order.platform,
        dailyPlatformSequence: order.dailyPlatformSequence,
        orderNo: order.orderNo,
        sourceId: order.sourceId,
        deliveryId: order.deliveryId,
      });

      if (result.ok) {
        await markJobSuccess(job.id, order.id, order.userId, order.sourceId, order.platform, order.orderNo, order.orderTime);
        results.push({ id: job.id, ok: true });
      } else {
        const errorText = JSON.stringify(result.data);
        console.error("[auto-pick-auto-complete] complete delivery command failed", {
          jobId: job.id,
          orderId: order.id,
          orderNo: order.orderNo,
          platform: order.platform,
          sourceId: order.sourceId,
          deliveryId: order.deliveryId,
          status: result.status,
          error: errorText,
        });
        if (isPermanentAutoCompleteError(result.status, errorText)) {
          const recovered = await retryAutoCompleteAfterRefresh(job);
          if (!recovered.recovered) {
            const finalError = recovered.error || errorText;
            console.error("[auto-pick-auto-complete] refresh after not-found did not recover", {
              jobId: job.id,
              orderId: order.id,
              orderNo: order.orderNo,
              platform: order.platform,
              sourceId: order.sourceId,
              deliveryId: order.deliveryId,
              status: recovered.status ?? result.status,
              error: finalError,
            });
            await markJobFailed(job.id, finalError);
          }
        } else {
          await markJobRetry(job.id, errorText);
        }
        results.push({ id: job.id, ok: false, error: errorText });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[auto-pick-auto-complete] complete delivery command threw", {
        jobId: job.id,
        orderId: order.id,
        orderNo: order.orderNo,
        platform: order.platform,
        sourceId: order.sourceId,
        deliveryId: order.deliveryId,
        error: message,
      });
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
    await reconcileMissingAutoCompleteJobs();
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
        status: JOB_PENDING,
      },
      update: {
        userId: params.userId,
        dueAt: params.dueAt,
        status: JOB_PENDING,
        lockedAt: null,
        completedAt: null,
        lastError: null,
    },
  });

  await scheduleNextAutoCompleteJob();
}

export async function cancelAutoCompleteJob(orderId: string, reason = "manual-cancel") {
  await prisma.$transaction([
    prisma.autoPickOrder.updateMany({
      where: {
        id: orderId,
      },
      data: {
        autoCompleteAt: null,
      },
    }),
    prisma.autoPickAutoCompleteJob.updateMany({
      where: {
        orderId,
        status: {
          in: [JOB_PENDING, JOB_RUNNING],
        },
      },
      data: {
        status: JOB_CANCELLED,
        lockedAt: null,
        lastError: reason.slice(0, 1000),
      },
    }),
  ]);

  await scheduleNextAutoCompleteJob();
}

export async function startAutoCompleteScheduler() {
  const state = getSchedulerState();
  if (state.started) {
    return;
  }

  state.started = true;
  await reconcileMissingAutoCompleteJobs();
  await scheduleNextAutoCompleteJob();

  if (!state.reconcileTimer) {
    state.reconcileTimer = setInterval(() => {
      void runAutoCompleteSchedulerCycle();
    }, AUTO_COMPLETE_RECONCILE_MS);
  }
}

export async function reconcileMissingAutoCompleteJobs(limit = 100) {
  const orders = await prisma.autoPickOrder.findMany({
    where: {
      autoCompleteAt: {
        not: null,
      },
      autoCompleteJob: {
        is: null,
      },
    },
    select: {
      id: true,
      userId: true,
      autoCompleteAt: true,
      status: true,
    },
    take: limit,
  });

  for (const order of orders) {
    if (!order.autoCompleteAt || isAutoPickOrderTerminalStatus(order.status) || isAutoPickOrderAbnormalStatus(order.status)) {
      await cancelAutoCompleteJob(order.id, "order-not-eligible-for-auto-complete");
      continue;
    }

    await prisma.autoPickAutoCompleteJob.upsert({
      where: { orderId: order.id },
      create: {
        userId: order.userId,
        orderId: order.id,
        dueAt: order.autoCompleteAt,
        status: JOB_PENDING,
      },
      update: {
        userId: order.userId,
        dueAt: order.autoCompleteAt,
        status: JOB_PENDING,
        lockedAt: null,
        completedAt: null,
        lastError: null,
      },
    });
  }
}
