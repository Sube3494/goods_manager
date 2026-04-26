import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { callAutoPickCommand, refreshAutoPickOrderFromPlugin } from "@/lib/autoPickOrders";
import { getEstimatedAutoCompleteAt } from "@/lib/autoPickSchedule";

export const dynamic = "force-dynamic";

function isCompletedStatus(status?: string | null) {
  return String(status || "").includes("已完成");
}

function isCancelledStatus(status?: string | null) {
  const text = String(status || "");
  return text.includes("取消") || text.includes("退款") || text.includes("关闭");
}

function readShopIdFromRawPayload(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const record = rawPayload as Record<string, unknown>;
  const value = String(record.shopId || record.shop_id || record.storeId || record.store_id || record.merchant_id || "").trim();
  return value || null;
}

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

    if (isCompletedStatus(order.status)) {
      return NextResponse.json({ error: "Order already completed" }, { status: 409 });
    }

    if (isCancelledStatus(order.status)) {
      return NextResponse.json({ error: "Order already cancelled" }, { status: 409 });
    }

    const result = await callAutoPickCommand(session.id, "/self-delivery", {
      platform: order.platform,
      dailyPlatformSequence: order.dailyPlatformSequence,
      orderNo: order.orderNo,
      sourceId: order.sourceId,
      logisticId: order.logisticId,
    });

    if (result.ok) {
      const refreshedOrder = await refreshAutoPickOrderFromPlugin(session.id, {
        id: order.sourceId,
        platform: order.platform,
        orderNo: order.orderNo,
        orderTime: order.orderTime,
      }).catch((refreshError) => {
        console.error("Failed to refresh auto-pick order after self delivery:", refreshError);
        return null;
      });

      const schedulingOrder = refreshedOrder || order;
      const shopExternalId = readShopIdFromRawPayload(schedulingOrder.rawPayload);
      const shop = shopExternalId
        ? await prisma.shop.findFirst({
            where: {
              userId: session.id,
              externalId: shopExternalId,
            },
            select: {
              longitude: true,
              latitude: true,
            },
          })
        : null;

      const autoCompleteAt = getEstimatedAutoCompleteAt({
        ...schedulingOrder,
        shopLongitude: shop?.longitude ?? null,
        shopLatitude: shop?.latitude ?? null,
      });
      await prisma.autoPickOrder.update({
        where: { id },
        data: {
          status: "配送中",
          deliveryDeadline: refreshedOrder?.deliveryDeadline || order.deliveryDeadline || null,
          autoCompleteAt: autoCompleteAt || null,
        },
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
