import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser, getAuthorizedUserAny } from "@/lib/auth";
import { Prisma } from "../../../../../prisma/generated-client";
import { returnOutboundOrderById } from "@/lib/outboundReturns";

function readCustomerRemarkFromRawPayload(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }
  const record = rawPayload as Record<string, unknown>;
  const value = String(
    record.customerRemark
    || record.user_remark
    || record.userRemark
    || ""
  ).trim();
  return value || null;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthorizedUser("order:manage");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const order = await prisma.autoPickOrder.findFirst({
      where: {
        id,
        userId: user.id,
      },
      select: {
        id: true,
        sourceId: true,
        longitude: true,
        latitude: true,
        delivery: true,
        rawPayload: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    }

    return NextResponse.json({
      order: {
        id: order.id,
        sourceId: order.sourceId,
        longitude: order.longitude,
        latitude: order.latitude,
        delivery: order.delivery,
        customerRemark: readCustomerRemarkFromRawPayload(order.rawPayload),
        detailLoaded: true,
        detailLoading: false,
      },
    });
  } catch (error) {
    console.error("Failed to get order detail:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "读取订单详情失败",
    }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthorizedUser("order:manage");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));

    const hasBrushToggle = body.isMainSystemSelfDelivery !== undefined;
    const nextExpectedIncome = Number(body.expectedIncome);
    const hasExpectedIncome = Number.isFinite(nextExpectedIncome);
    const hasAmountEdit = hasExpectedIncome;

    if (!hasBrushToggle && !hasAmountEdit) {
      return NextResponse.json({ error: "参数错误" }, { status: 400 });
    }

    if (hasAmountEdit) {
      if (nextExpectedIncome < 0) {
        return NextResponse.json({ error: "金额不能小于 0" }, { status: 400 });
      }
    }

    const order = await prisma.autoPickOrder.findFirst({
      where: {
        id,
        userId: user.id,
      },
      select: {
        id: true,
        actualPaid: true,
        expectedIncome: true,
        platformCommission: true,
        rawPayload: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    }

    const rawPayload = order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)
      ? order.rawPayload as Record<string, any>
      : {};

    const systemMeta = rawPayload.systemMeta && typeof rawPayload.systemMeta === "object" && !Array.isArray(rawPayload.systemMeta)
      ? rawPayload.systemMeta as Record<string, any>
      : {};

    const mainSystemSelfDelivery = systemMeta.mainSystemSelfDelivery && typeof systemMeta.mainSystemSelfDelivery === "object" && !Array.isArray(systemMeta.mainSystemSelfDelivery)
      ? systemMeta.mainSystemSelfDelivery as Record<string, any>
      : {};

    const manualAmountOverride = systemMeta.manualAmountOverride && typeof systemMeta.manualAmountOverride === "object" && !Array.isArray(systemMeta.manualAmountOverride)
      ? systemMeta.manualAmountOverride as Record<string, any>
      : {};

    const actualPaid = order.actualPaid;
    const expectedIncome = hasExpectedIncome ? Math.round(nextExpectedIncome) : order.expectedIncome;
    const platformCommission = hasAmountEdit
      ? Math.round(Number(expectedIncome || 0) - Number(actualPaid || 0))
      : order.platformCommission;

    await prisma.autoPickOrder.update({
      where: { id: order.id },
      data: {
        ...(hasAmountEdit
          ? {
              actualPaid,
              expectedIncome,
              platformCommission,
            }
          : {}),
        rawPayload: {
          ...rawPayload,
          systemMeta: {
            ...systemMeta,
            ...(hasBrushToggle
              ? {
                  mainSystemSelfDelivery: {
                    ...mainSystemSelfDelivery,
                    triggered: Boolean(body.isMainSystemSelfDelivery),
                  },
                }
              : {}),
            ...(hasAmountEdit
              ? {
                  manualAmountOverride: {
                    ...manualAmountOverride,
                    expectedIncome,
                    updatedAt: new Date().toISOString(),
                    updatedBy: String(user.name || user.email || user.id),
                  },
                }
              : {}),
          },
        } as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      ok: true,
      isMainSystemSelfDelivery: hasBrushToggle ? Boolean(body.isMainSystemSelfDelivery) : undefined,
      actualPaid,
      expectedIncome,
      platformCommission,
    });
  } catch (error) {
    console.error("Failed to patch order:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "更新订单失败",
    }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthorizedUserAny("order:manage", "outbound:manage");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const reason = String(body?.reason || "").trim() || "线下订单录入有误，已作废";

    const order = await prisma.autoPickOrder.findFirst({
      where: {
        id,
        userId: user.id,
      },
      select: {
        id: true,
        orderNo: true,
        platform: true,
        status: true,
        rawPayload: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    }

    if (order.platform !== "线下交易") {
      return NextResponse.json({ error: "当前只支持作废线下订单" }, { status: 400 });
    }

    if (String(order.status || "").includes("删除")) {
      return NextResponse.json({ ok: true, alreadyDeleted: true, returnedOutboundCount: 0 });
    }

    const relatedOutboundOrders = await prisma.outboundOrder.findMany({
      where: {
        userId: user.id,
        status: {
          not: "Returned",
        },
        note: {
          contains: `平台单号: ${order.orderNo}`,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    for (const outbound of relatedOutboundOrders) {
      await returnOutboundOrderById(user.id, outbound.id, `线下订单作废：${reason}`);
    }

    const rawPayload = order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)
      ? order.rawPayload as Record<string, unknown>
      : {};
    const systemMeta = rawPayload.systemMeta && typeof rawPayload.systemMeta === "object" && !Array.isArray(rawPayload.systemMeta)
      ? rawPayload.systemMeta as Record<string, unknown>
      : {};

    await prisma.autoPickOrder.update({
      where: { id: order.id },
      data: {
        status: "已删除",
        lastSyncedAt: new Date(),
        rawPayload: {
          ...rawPayload,
          systemMeta: {
            ...systemMeta,
            manualOfflineVoided: {
              reason,
              voidedAt: new Date().toISOString(),
              voidedBy: String(user.name || user.email || user.id),
              returnedOutboundCount: relatedOutboundOrders.length,
            },
          },
        } as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      ok: true,
      returnedOutboundCount: relatedOutboundOrders.length,
    });
  } catch (error) {
    console.error("Failed to delete offline order:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "作废线下订单失败",
    }, { status: 500 });
  }
}
