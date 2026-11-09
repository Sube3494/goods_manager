import { NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAuthorizedUser("order:manage");
  if (session?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "仅超级管理员可查看其他成员的订单分布" }, { status: 403 });
  }

  try {
    const members = await prisma.user.findMany({
      where: { id: { not: session.id }, autoPickOrders: { some: {} } },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    });

    return NextResponse.json({ members });
  } catch (error) {
    console.error("Failed to fetch order distribution members:", error);
    return NextResponse.json({ error: "读取成员列表失败" }, { status: 500 });
  }
}
