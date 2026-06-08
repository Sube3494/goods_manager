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
    
    // 期望接收 { isMainSystemSelfDelivery: boolean }
    if (body.isMainSystemSelfDelivery === undefined) {
      return NextResponse.json({ error: "参数错误" }, { status: 400 });
    }

    const order = await prisma.autoPickOrder.findFirst({
      where: {
        id,
        userId: user.id,
      },
      select: {
        id: true,
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

    // 更新 mainSystemSelfDelivery.triggered
    await prisma.autoPickOrder.update({
      where: { id: order.id },
      data: {
        rawPayload: {
          ...rawPayload,
          systemMeta: {
            ...systemMeta,
            mainSystemSelfDelivery: {
              ...mainSystemSelfDelivery,
              triggered: Boolean(body.isMainSystemSelfDelivery),
            },
          },
        } as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      ok: true,
      isMainSystemSelfDelivery: Boolean(body.isMainSystemSelfDelivery),
    });
  } catch (error) {
    console.error("Failed to patch order:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "更新订单失败",
    }, { status: 500 });
  }
}
