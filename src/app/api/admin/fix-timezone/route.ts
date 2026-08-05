import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";

export async function POST() {
  try {
    const session = await getAuthorizedUser();
    if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "ADMIN")) {
      return NextResponse.json({ error: "权限不足，仅管理员可执行线上时区修复" }, { status: 403 });
    }

    // 获取近期 300 张发货单进行巡检校准
    const recentOrders = await prisma.outboundOrder.findMany({
      orderBy: { createdAt: "desc" },
      take: 300,
    });

    let fixCount = 0;
    const fixedIds: string[] = [];

    for (const order of recentOrders) {
      const diffMs = order.date.getTime() - order.createdAt.getTime();
      const eightHoursMs = 8 * 60 * 60 * 1000;
      // 如果业务时间比系统创建时间快了大约 8 小时（误差在 30 分钟内）
      if (Math.abs(diffMs - eightHoursMs) < 30 * 60 * 1000) {
        await prisma.outboundOrder.update({
          where: { id: order.id },
          data: {
            date: order.createdAt,
          },
        });
        fixedIds.push(order.id);
        fixCount++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `线上时区校准执行完成！共成功修正 ${fixCount} 张异常单据。`,
      fixedCount: fixCount,
      fixedIds,
    });
  } catch (error: any) {
    console.error("线上时区数据校准失败:", error);
    return NextResponse.json({ error: error.message || "服务器内部错误" }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
