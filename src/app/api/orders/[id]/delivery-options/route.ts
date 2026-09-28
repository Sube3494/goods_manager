import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { callAutoPickCommand } from "@/lib/autoPickOrders";
import { getShansongConnectionStatus, hasActiveShansongDelivery, quoteShansongDelivery } from "@/lib/shansong";
import {
  isAutoPickOrderCancelledStatus,
  isAutoPickOrderCompletedStatus,
  isAutoPickOrderDeliveringStatus,
  isAutoPickOrderRiderAssigned,
  isAutoPickPickupOrder,
} from "@/lib/autoPickOrderStatus";

export const dynamic = "force-dynamic";

type DeliveryCategory = "direct" | "shared" | "standard";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeMaiyitianOption(value: unknown) {
  const option = asRecord(value) || {};
  const category = String(option.category || "").trim();
  return {
    ...option,
    provider: "maiyitian" as const,
    servicePkg: String(option.servicePkg ?? option.service_pkg ?? "").trim(),
    category: (["direct", "shared", "standard"] as DeliveryCategory[]).includes(category as DeliveryCategory)
      ? category as DeliveryCategory
      : "standard",
  };
}

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) return NextResponse.json({ error: "Permission denied" }, { status: 403 });

  try {
    const { id } = await context.params;
    const isAdmin = Boolean(
      session.role === "SUPER_ADMIN"
      || (session.role && String(session.role).includes("管理"))
      || (Array.isArray(session.permissions) && (session.permissions.includes("*") || session.permissions.includes("members:manage") || session.permissions.includes("admin")))
    );
    const order = await prisma.autoPickOrder.findFirst({
      where: { id, ...(isAdmin ? {} : { userId: session.id }) },
      include: { items: { orderBy: { createdAt: "asc" } } },
    });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (isAutoPickOrderCompletedStatus(order.status) || isAutoPickOrderCancelledStatus(order.status)) {
      return NextResponse.json({ error: "订单已结束，不能呼叫配送" }, { status: 409 });
    }
    if (isAutoPickPickupOrder(order.rawPayload, order.userAddress, order.shopAddress)) {
      return NextResponse.json({ error: "到店自取订单不需要呼叫配送" }, { status: 409 });
    }
    if (isAutoPickOrderDeliveringStatus(order.status) || isAutoPickOrderRiderAssigned(order)) {
      return NextResponse.json({ error: "订单已有配送任务，不能重复呼叫" }, { status: 409 });
    }
    if (hasActiveShansongDelivery(order.rawPayload)) {
      return NextResponse.json({ error: "该订单已有闪送任务，不能重复发单" }, { status: 409 });
    }
    const sourceId = String(order.sourceId || "").trim();
    const shansongStatus = await getShansongConnectionStatus(order.userId).catch(() => ({
      appConfigured: false,
      authorized: false,
      shopId: null,
      expiresAt: null,
      authorizedAt: null,
      boundShopId: null,
      boundShopName: null,
    }));
    const [maiyitianResult, shansongResult] = await Promise.allSettled([
      sourceId
        ? callAutoPickCommand(order.userId, "/delivery-options", { sourceId })
        : Promise.reject(new Error("订单缺少麦芽田订单标识")),
      shansongStatus.authorized
        ? quoteShansongDelivery(order)
        : Promise.reject(new Error(shansongStatus.appConfigured ? "闪送个人账号未授权" : "闪送开放平台应用未配置")),
    ]);

    const maiyitianData = maiyitianResult.status === "fulfilled" ? maiyitianResult.value.data : {};
    const maiyitianOptions = Array.isArray(maiyitianData?.options)
      ? maiyitianData.options.map(normalizeMaiyitianOption)
      : [];
    const options = [
      ...maiyitianOptions,
      ...(shansongResult.status === "fulfilled" ? [{ ...shansongResult.value, category: "direct" as const }] : []),
    ];
    const providerErrors = {
      maiyitian: maiyitianResult.status === "rejected"
        ? (maiyitianResult.reason instanceof Error ? maiyitianResult.reason.message : "麦芽田询价失败")
        : (!maiyitianResult.value.ok ? String(maiyitianResult.value.data?.error || maiyitianResult.value.data?.message || "麦芽田询价失败") : null),
      shansong: shansongResult.status === "rejected"
        ? (shansongResult.reason instanceof Error ? shansongResult.reason.message : "闪送询价失败")
        : null,
    };

    if (options.length === 0 && maiyitianResult.status === "fulfilled" && !maiyitianResult.value.ok && !shansongStatus.authorized) {
      return NextResponse.json({ options, shansong: shansongStatus, providerErrors }, { status: 200 });
    }
    return NextResponse.json({
      ...(maiyitianData && typeof maiyitianData === "object" ? maiyitianData : {}),
      options,
      shansong: shansongStatus,
      providerErrors,
    });
  } catch (error) {
    console.error("Failed to load delivery options:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "获取配送报价失败" }, { status: 500 });
  }
}
