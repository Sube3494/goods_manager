import prisma from "@/lib/prisma";
import { Prisma } from "../../prisma/generated-client";

type OfflineOrderRepairCandidate = {
  id: string;
  orderNo: string;
  actualPaid: number;
  expectedIncome: number;
  deliveryFee: number;
  createdAt: string;
  status: string | null;
};

function readDeliveryFee(delivery: Prisma.JsonValue | null): number {
  if (!delivery || typeof delivery !== "object" || Array.isArray(delivery)) {
    return 0;
  }
  const value = Number((delivery as Record<string, unknown>).sendFee || 0);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function hasManualAmountOverride(rawPayload: Prisma.JsonValue | null): boolean {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return false;
  }
  const systemMeta = (rawPayload as Record<string, unknown>).systemMeta;
  if (!systemMeta || typeof systemMeta !== "object" || Array.isArray(systemMeta)) {
    return false;
  }
  const manualAmountOverride = (systemMeta as Record<string, unknown>).manualAmountOverride;
  return Boolean(manualAmountOverride && typeof manualAmountOverride === "object" && !Array.isArray(manualAmountOverride));
}

export async function previewOfflineOrderAmountRepair(userId: string) {
  const orders = await prisma.autoPickOrder.findMany({
    where: {
      userId,
      platform: "线下交易",
      expectedIncome: {
        not: null,
      },
    },
    select: {
      id: true,
      orderNo: true,
      actualPaid: true,
      expectedIncome: true,
      delivery: true,
      rawPayload: true,
      createdAt: true,
      status: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const candidates: OfflineOrderRepairCandidate[] = [];
  for (const order of orders) {
    if (hasManualAmountOverride(order.rawPayload)) {
      continue;
    }
    const expectedIncome = Number(order.expectedIncome);
    const actualPaid = Number(order.actualPaid || 0);
    const deliveryFee = readDeliveryFee(order.delivery);
    if (!Number.isFinite(expectedIncome) || deliveryFee <= 0) {
      continue;
    }
    if (actualPaid !== expectedIncome + deliveryFee) {
      continue;
    }
    candidates.push({
      id: order.id,
      orderNo: order.orderNo,
      actualPaid,
      expectedIncome,
      deliveryFee,
      createdAt: order.createdAt.toISOString(),
      status: order.status || null,
    });
  }

  return candidates;
}

export async function applyOfflineOrderAmountRepair(userId: string) {
  const candidates = await previewOfflineOrderAmountRepair(userId);
  if (candidates.length === 0) {
    return {
      scannedCount: 0,
      updatedCount: 0,
      candidates: [] as OfflineOrderRepairCandidate[],
    };
  }

  await prisma.$transaction(async (tx) => {
    for (const candidate of candidates) {
      const order = await tx.autoPickOrder.findFirst({
        where: {
          id: candidate.id,
          userId,
        },
        select: {
          id: true,
          rawPayload: true,
        },
      });

      if (!order) {
        continue;
      }

      const rawPayload = order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)
        ? order.rawPayload as Record<string, unknown>
        : {};
      const systemMeta = rawPayload.systemMeta && typeof rawPayload.systemMeta === "object" && !Array.isArray(rawPayload.systemMeta)
        ? rawPayload.systemMeta as Record<string, unknown>
        : {};

      await tx.autoPickOrder.update({
        where: { id: order.id },
        data: {
          actualPaid: candidate.expectedIncome,
          expectedIncome: candidate.expectedIncome,
          platformCommission: 0,
          rawPayload: {
            ...rawPayload,
            systemMeta: {
              ...systemMeta,
              offlineAmountRepair: {
                fixedAt: new Date().toISOString(),
                oldActualPaid: candidate.actualPaid,
                oldExpectedIncome: candidate.expectedIncome,
                deliveryFee: candidate.deliveryFee,
                reason: "历史线下订单曾错误将配送支出计入顾客实付，已自动修正",
              },
            },
          } as Prisma.InputJsonValue,
        },
      });
    }
  });

  return {
    scannedCount: candidates.length,
    updatedCount: candidates.length,
    candidates,
  };
}
