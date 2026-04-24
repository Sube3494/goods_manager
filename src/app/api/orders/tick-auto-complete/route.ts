import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { callAutoPickCommand } from "@/lib/autoPickOrders";

export const dynamic = "force-dynamic";

export async function POST(_: NextRequest) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const now = new Date();

  // 找出当前用户所有已到期、待自动完成的订单
  const pendingOrders = await prisma.autoPickOrder.findMany({
    where: {
      userId: session.id,
      autoCompleteAt: {
        lte: now,
      },
    },
    select: {
      id: true,
      platform: true,
      dailyPlatformSequence: true,
      orderNo: true,
      sourceId: true,
      logisticId: true,
    },
  });

  if (pendingOrders.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const order of pendingOrders) {
    try {
      const result = await callAutoPickCommand(session.id, "/complete-delivery", {
        platform: order.platform,
        dailyPlatformSequence: order.dailyPlatformSequence,
        orderNo: order.orderNo,
        sourceId: order.sourceId,
        logisticId: order.logisticId,
      });

      if (result.ok) {
        // 成功后清除计划时间，避免重复触发
        await prisma.autoPickOrder.update({
          where: { id: order.id },
          data: { autoCompleteAt: null },
        });
        results.push({ id: order.id, ok: true });
      } else {
        results.push({ id: order.id, ok: false, error: JSON.stringify(result.data) });
      }
    } catch (error) {
      results.push({
        id: order.id,
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  console.log(`[tick-auto-complete] processed=${results.length} ok=${succeeded} fail=${failed}`);

  return NextResponse.json({ processed: results.length, succeeded, failed, results });
}
