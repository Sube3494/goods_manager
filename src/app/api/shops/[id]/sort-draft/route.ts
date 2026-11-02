import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { parseShopSortDraft } from "@/lib/shopSortDraft";

type Context = { params: Promise<{ id: string }> };

function storageError(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "P2021" || code === "P2022") {
    return NextResponse.json({ error: "服务器排序记忆表未就绪，请检查容器启动时的数据库结构更新日志" }, { status: 503 });
  }
  if (code === "P1001" || code === "P1002" || code === "P2024") {
    return NextResponse.json({ error: "服务器数据库暂时无法连接，请稍后重试保存" }, { status: 503 });
  }
  return NextResponse.json({ error: "服务器保存排序记忆失败，请检查容器日志" }, { status: 500 });
}

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
    return storageError(error);
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    const key = await authorize(context);
    if (!key) return NextResponse.json({ error: "无权访问店铺排序记忆" }, { status: 403 });
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "排序保存请求不是有效 JSON" }, { status: 400 });
    const draft = parseShopSortDraft(body.draft);
    if (!draft) return NextResponse.json({ error: "排序记忆格式不正确" }, { status: 400 });
    let record;
    if (body.importOnly === true) {
      // 旧浏览器草稿只能填补空记录，不能覆盖其他设备已保存的记忆。
      await prisma.shopSortDraft.createMany({ data: [{ ...key, data: draft }], skipDuplicates: true });
      record = await prisma.shopSortDraft.findUnique({ where: { userId_shopId: key } });
    } else {
      record = await prisma.shopSortDraft.upsert({
        where: { userId_shopId: key }, create: { ...key, data: draft }, update: { data: draft },
      });
    }
    if (!record) throw new Error("Saved shop sort draft not found");
    return NextResponse.json({ draft: record.data });
  } catch (error) {
    console.error("Failed to save account shop sort draft:", error);
    return storageError(error);
  }
}
