import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const session = await getAuthorizedUser("logistics:manage");
    if (!session) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const all = searchParams.get("all") === "true";

    const where: {
      userId: string;
      isActive?: boolean;
    } = { userId: session.id };
    if (!all) {
      where.isActive = true;
    }

    const list = await prisma.logisticsCompany.findMany({
      where,
      orderBy: [
        { name: "asc" },
      ],
    });

    return NextResponse.json(list);
  } catch (error) {
    console.error("Failed to fetch logistics companies:", error);
    return NextResponse.json({ error: "获取物流公司失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getAuthorizedUser("logistics:manage");
    if (!session) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const body = await request.json();
    const { name, code, isActive, sortOrder } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "物流公司名称不能为空" }, { status: 400 });
    }

    // 检查是否重名
    const existing = await prisma.logisticsCompany.findFirst({
      where: {
        userId: session.id,
        name: name.trim(),
      },
    });

    if (existing) {
      return NextResponse.json({ error: "该物流公司名称已存在" }, { status: 400 });
    }

    const created = await prisma.logisticsCompany.create({
      data: {
        name: name.trim(),
        code: code?.trim() || null,
        isActive: isActive !== false,
        sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
        userId: session.id,
      },
    });

    return NextResponse.json(created);
  } catch (error) {
    console.error("Failed to create logistics company:", error);
    return NextResponse.json({ error: "创建物流公司失败" }, { status: 500 });
  }
}
