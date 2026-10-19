import { randomUUID } from "node:crypto";
import prisma from "@/lib/prisma";
import { Prisma } from "../../prisma/generated-client";
import { refreshAutoPickOrderFromPlugin } from "@/lib/autoPickOrders";
import { executeOrderSelfDelivery } from "@/lib/executeOrderSelfDelivery";
import { emitAutoPickOrderEvent } from "@/lib/autoPickOrderEvents";
import { isOrderReadyForQueuedSelfDelivery, queuedSelfDeliveryBlockedReason, readQueuedSelfDelivery, type QueuedSelfDelivery } from "@/lib/queuedSelfDeliveryRules";

const POLL_MS = 30_000;
const STALE_MS = 5 * 60_000;
const scope = globalThis as typeof globalThis & {
  queuedSelfDeliveryScheduler?: { timer?: ReturnType<typeof setInterval>; running: boolean };
};

function state() {
  return scope.queuedSelfDeliveryScheduler ??= { running: false };
}

function json(value: QueuedSelfDelivery): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value));
}

type Order = NonNullable<Awaited<ReturnType<typeof prisma.autoPickOrder.findUnique>>>;

async function transition(order: Order, previous: QueuedSelfDelivery, status: QueuedSelfDelivery["status"], error?: string) {
  const next = { ...previous, status, error, updatedAt: new Date().toISOString() };
  const changed = await prisma.autoPickOrder.updateMany({
    where: {
      id: order.id,
      AND: [
        { queuedSelfDelivery: { path: ["token"], equals: previous.token } },
        { queuedSelfDelivery: { path: ["status"], equals: previous.status } },
      ],
    },
    data: { queuedSelfDelivery: json(next) },
  });
  if (changed.count) emitAutoPickOrderEvent({ type: "upsert", userId: order.userId, orderId: order.id, at: next.updatedAt });
  return changed.count ? next : null;
}

export async function setQueuedSelfDelivery(order: Order, enabled: boolean) {
  const previous = readQueuedSelfDelivery(order.queuedSelfDelivery);
  if (previous?.status === "running") throw new Error("正在发起自配，请稍后同步查看结果");
  if (enabled) {
    const reason = queuedSelfDeliveryBlockedReason(order);
    if (reason) throw new Error(reason);
    if (previous?.status === "waiting") return order;
  } else {
    if (previous?.status !== "waiting") return order;
    if (!await transition(order, previous, "cancelled")) throw new Error("订单状态已变化，请刷新后重试");
    return prisma.autoPickOrder.findUniqueOrThrow({ where: { id: order.id } });
  }
  const now = new Date().toISOString();
  const job: QueuedSelfDelivery = { token: randomUUID(), status: "waiting", requestedAt: now, updatedAt: now };
  const changed = await prisma.autoPickOrder.updateMany({
    where: { id: order.id, updatedAt: order.updatedAt },
    data: { queuedSelfDelivery: json(job) },
  });
  if (!changed.count) throw new Error("订单状态已变化，请刷新后重试");
  emitAutoPickOrderEvent({ type: "upsert", userId: order.userId, orderId: order.id, at: now });
  return prisma.autoPickOrder.findUniqueOrThrow({ where: { id: order.id } });
}

export async function processQueuedSelfDeliveryOrder(id: string) {
  let order = await prisma.autoPickOrder.findUnique({ where: { id } });
  if (!order) return;
  let job = readQueuedSelfDelivery(order.queuedSelfDelivery);
  if (!job) return;
  if (job.status === "running") {
    if (Date.now() - Date.parse(job.updatedAt) > STALE_MS) {
      // 不能确定之前的命令是否成功时不自动重发，避免重复发单。
      await transition(order, job, "failed", "自配结果未确认，请同步订单后检查；不会自动重复发起");
    }
    return;
  }
  if (job.status !== "waiting") return;
  let blocked = queuedSelfDeliveryBlockedReason(order);
  if (blocked) { await transition(order, job, "cancelled", blocked); return; }

  // 使用平台最新状态，不能依据页面打开时的旧状态发单。
  const refreshed = await refreshAutoPickOrderFromPlugin(order.userId, {
    id: order.sourceId, platform: order.platform, orderNo: order.orderNo, orderTime: order.orderTime,
  }).catch(() => null);
  if (!refreshed) {
    await transition(order, job, "waiting", "暂未同步到平台最新状态，继续等待");
    return;
  }
  const latest = await prisma.autoPickOrder.findUnique({ where: { id } });
  if (!latest) return;
  order = latest;
  job = readQueuedSelfDelivery(order.queuedSelfDelivery);
  if (job?.status !== "waiting") return;
  blocked = queuedSelfDeliveryBlockedReason(order);
  if (blocked) { await transition(order, job, "cancelled", blocked); return; }
  if (!isOrderReadyForQueuedSelfDelivery(order)) {
    await transition(order, job, "waiting");
    return;
  }
  const claimed = await transition(order, job, "running");
  if (!claimed) return;
  try {
    const response = await executeOrderSelfDelivery(id, { id: order.userId, role: "USER" }, true);
    const result = await response.json().catch(() => ({}));
    await transition(order, claimed, response.ok ? "succeeded" : "failed",
      response.ok ? undefined : String(result.error || result.message || "自动自配失败，请同步订单后检查"));
  } catch (error) {
    await transition(order, claimed, "failed", error instanceof Error ? error.message : "自动自配失败，请同步订单后检查");
  }
}

export async function processQueuedSelfDeliveries() {
  const scheduler = state();
  if (scheduler.running) return;
  scheduler.running = true;
  try {
    const orders = await prisma.autoPickOrder.findMany({
      where: { OR: [
        { queuedSelfDelivery: { path: ["status"], equals: "waiting" } },
        { AND: [
          { queuedSelfDelivery: { path: ["status"], equals: "running" } },
          { queuedSelfDelivery: { path: ["updatedAt"], lt: new Date(Date.now() - STALE_MS).toISOString() } },
        ] },
      ] },
      orderBy: { updatedAt: "asc" }, take: 20, select: { id: true },
    });
    for (const order of orders) {
      await processQueuedSelfDeliveryOrder(order.id).catch((error) => console.error("Queued self delivery failed:", order.id, error));
    }
  } finally { scheduler.running = false; }
}

export function startQueuedSelfDeliveryScheduler() {
  const scheduler = state();
  if (scheduler.timer) return;
  const run = () => { void processQueuedSelfDeliveries().catch((error) => console.error("Queued self delivery scheduler failed:", error)); };
  scheduler.timer = setInterval(run, POLL_MS);
  scheduler.timer.unref?.();
  run();
}
