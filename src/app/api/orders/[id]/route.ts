import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { Prisma } from "../../../../../prisma/generated-client";

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
