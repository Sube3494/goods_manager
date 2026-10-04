import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUserAny } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Prisma } from "@/../prisma/generated-client";
import {
  readOrderExtraExpensesFromRawPayload,
  calculateOrderTotalExtraExpense,
} from "@/lib/autoPickOrders";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthorizedUserAny("order:manage", "members:orders");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const order = await prisma.autoPickOrder.findFirst({
      where: {
        id,
        ...(user.role === "SUPER_ADMIN" ? {} : { userId: user.id }),
      },
      select: {
        id: true,
        rawPayload: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    }

    const extraExpenses = readOrderExtraExpensesFromRawPayload(order.rawPayload);
    const totalExtraExpense = calculateOrderTotalExtraExpense(extraExpenses);

    return NextResponse.json({
      extraExpenses,
      totalExtraExpense,
    });
  } catch (error) {
    console.error("Failed to get order extra expenses:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "获取额外支出失败",
    }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthorizedUserAny("order:manage", "members:orders");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const rawExpenses = Array.isArray(body?.extraExpenses) ? body.extraExpenses : [];

    const order = await prisma.autoPickOrder.findFirst({
      where: {
        id,
        ...(user.role === "SUPER_ADMIN" ? {} : { userId: user.id }),
      },
      select: {
        id: true,
        rawPayload: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    }

    const sanitizedExpenses = rawExpenses
      .filter((item: unknown): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map((item: Record<string, unknown>): {
        id: string;
        name: string;
        amount: number;
        type: "expense" | "income";
        createdAt: string;
      } => {
        const rawAmount = Number(item.amount ?? 0);
        const amount = Math.round(rawAmount);
        const rawType = String(item.type || "").trim().toLowerCase();
        const type: "expense" | "income" = rawType === "income" ? "income" : "expense";
        return {
          id: String(item.id || "").trim() || `exp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: String(item.name || "").trim() || (type === "income" ? "额外收入" : "意外花费"),
          amount,
          type,
          createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
        };
      })
      .filter((item: { amount: number }) => item.amount > 0);

    const rawPayload = (order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload))
      ? order.rawPayload as Record<string, unknown>
      : {};
    const systemMeta = (rawPayload.systemMeta && typeof rawPayload.systemMeta === "object" && !Array.isArray(rawPayload.systemMeta))
      ? rawPayload.systemMeta as Record<string, unknown>
      : {};

    await prisma.autoPickOrder.update({
      where: { id: order.id },
      data: {
        lastSyncedAt: new Date(),
        rawPayload: {
          ...rawPayload,
          systemMeta: {
            ...systemMeta,
            extraExpenses: sanitizedExpenses,
          },
        } as Prisma.InputJsonValue,
      },
    });

    const totalExtraExpense = calculateOrderTotalExtraExpense(sanitizedExpenses);

    return NextResponse.json({
      ok: true,
      extraExpenses: sanitizedExpenses,
      totalExtraExpense,
    });
  } catch (error) {
    console.error("Failed to save order extra expenses:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "保存额外支出失败",
    }, { status: 500 });
  }
}
