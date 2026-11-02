import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { parseShopSortDraft } from "@/lib/shopSortDraft";

type Context = { params: Promise<{ id: string }> };

async function authorize(context: Context) {
  const user = await getAuthorizedUser("product:update");
  if (!user) return null;
  const { id: shopId } = await context.params;
  const shop = await prisma.shop.findFirst({
    where: { id: shopId, ...(user.role === "SUPER_ADMIN" ? {} : { userId: user.id }) },
    select: { id: true },
  });
  return shop ? { userId: user.id, shopId } : null;
}

export async function GET(_request: Request, context: Context) {
  try {
    const key = await authorize(context);
    if (!key) return NextResponse.json({ error: "无权访问店铺排序记忆" }, { status: 403 });
    const record = await prisma.shopSortDraft.findUnique({ where: { userId_shopId: key } });
    return NextResponse.json({ draft: record?.data ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to load account shop sort draft:", error);
    return NextResponse.json({ error: "加载账户排序记忆失败，请重试" }, { status: 500 });
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    const key = await authorize(context);
    if (!key) return NextResponse.json({ error: "无权访问店铺排序记忆" }, { status: 403 });
    const body = await request.json();
    const draft = parseShopSortDraft(body.draft);
    if (!draft) return NextResponse.json({ error: "排序记忆格式不正确" }, { status: 400 });
    if (body.importOnly === true) {
      // 旧浏览器草稿只能填补空记录，不能覆盖其他设备已保存的记忆。
      await prisma.shopSortDraft.createMany({ data: [{ ...key, data: draft }], skipDuplicates: true });
    } else {
      await prisma.shopSortDraft.upsert({
        where: { userId_shopId: key }, create: { ...key, data: draft }, update: { data: draft },
      });
    }
    const record = await prisma.shopSortDraft.findUnique({ where: { userId_shopId: key } });
    return NextResponse.json({ draft: record?.data ?? null });
  } catch (error) {
    console.error("Failed to save account shop sort draft:", error);
    return NextResponse.json({ error: "保存账户排序记忆失败，请重试" }, { status: 500 });
  }
}
