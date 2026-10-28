import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getAuthorizedUser("logistics:manage");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await context.params;
  const { name } = await request.json().catch(() => ({}));
  if (typeof name !== "string" || !name.trim() || name.trim().length > 40) return NextResponse.json({ error: "分组名称需为 1～40 个字符" }, { status: 400 });
  try {
    const result = await prisma.dispatchGroup.updateMany({ where: { id, userId: user.id }, data: { name: name.trim() } });
    return result.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "分组不存在" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "分组名称已存在或保存失败" }, { status: 409 });
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getAuthorizedUser("logistics:manage");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await context.params;
  try {
    const result = await prisma.dispatchGroup.deleteMany({ where: { id, userId: user.id, locations: { none: {} } } });
    return result.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "分组不存在或仍有网点，请先将网点移到其他分组" }, { status: 409 });
  } catch {
    return NextResponse.json({ error: "分组仍有网点，无法删除" }, { status: 409 });
  }
}
