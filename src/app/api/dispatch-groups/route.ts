import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";

export async function POST(request: Request) {
  const user = await getAuthorizedUser("logistics:manage");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 40) return NextResponse.json({ error: "分组名称需为 1～40 个字符" }, { status: 400 });
  try {
    const group = await prisma.dispatchGroup.create({ data: { userId: user.id, name } });
    return NextResponse.json({ group });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return NextResponse.json({ error: "分组名称已存在" }, { status: 409 });
    return NextResponse.json({ error: "创建分组失败" }, { status: 500 });
  }
}
