import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { callAutoPickCommand } from "@/lib/autoPickOrders";

export const dynamic = "force-dynamic";

// 5 分钟到店 + 每公里 2 分钟
const PICKUP_MINUTES = 5;
const MINUTES_PER_KM = 2;

export async function POST(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const order = await prisma.autoPickOrder.findFirst({
      where: {
        id,
        userId: session.id,
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const result = await callAutoPickCommand(session.id, "/self-delivery", {
      platform: order.platform,
      dailyPlatformSequence: order.dailyPlatformSequence,
      orderNo: order.orderNo,
      sourceId: order.sourceId,
      logisticId: order.logisticId,
    });

    // 自配送成功后，计划自动完成配送时间（仅当有距离信息时）
    if (result.ok && typeof order.distanceKm === "number") {
      const distanceKm = order.distanceKm;
      const delayMinutes = PICKUP_MINUTES + distanceKm * MINUTES_PER_KM;
      const autoCompleteAt = new Date(Date.now() + delayMinutes * 60 * 1000);

      await prisma.autoPickOrder.update({
        where: { id },
        data: { autoCompleteAt },
      });
    }

    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error("Failed to start self delivery:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to start self delivery",
    }, { status: 500 });
  }
}

