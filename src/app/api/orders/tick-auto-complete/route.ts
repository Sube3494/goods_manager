import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { callAutoPickCommand, refreshAutoPickOrderFromPlugin } from "@/lib/autoPickOrders";

export const dynamic = "force-dynamic";

export async function POST() {
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
      NOT: [
        { status: { contains: "已完成" } },
        { status: { contains: "取消" } },
        { status: { contains: "退款" } },
        { status: { contains: "关闭" } },
      ],
    },
    select: {
      id: true,
      platform: true,
      dailyPlatformSequence: true,
      orderNo: true,
      sourceId: true,
      logisticId: true,
      orderTime: true,
      distanceKm: true,
      deliveryDeadline: true,
      autoCompleteAt: true,
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
        await prisma.autoPickOrder.update({
          where: { id: order.id },
          data: {
            status: "已完成",
            autoCompleteAt: null,
            lastSyncedAt: new Date(),
          },
        });

        void refreshAutoPickOrderFromPlugin(session.id, {
          id: order.sourceId,
          platform: order.platform,
          orderNo: order.orderNo,
          orderTime: order.orderTime,
        }).catch((refreshError) => {
          console.error("Failed to refresh auto-pick order after tick auto complete:", refreshError);
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
