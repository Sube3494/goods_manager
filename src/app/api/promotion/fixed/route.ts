import { mayReadMemberData } from "@/lib/memberDataVisibilityServer";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { hasAdminAccess } from "@/lib/permissions";
import { validPromotionDate, parsePromotionAmounts, getActiveFixedPromotionRules } from "@/lib/fixedPromotion";
import { getFixedPromotionRules } from "@/services/promotionService";
import { parseAsShanghaiTime } from "@/lib/dateUtils";
import { isPrismaMissingTableError } from "@/lib/prismaSchemaCompat";

export async function GET(request: NextRequest) {
  const user = await getAuthorizedUser("order:manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const date = request.nextUrl.searchParams.get("date");
  if (!validPromotionDate(date)) return NextResponse.json({ error: "生效日期无效" }, { status: 400 });
  const requestedUserId = request.nextUrl.searchParams.get("userId");
  const canManageMembers = user.role === "SUPER_ADMIN" || (["members:orders", "members:manage", "members:status", "whitelist:manage", "roles:manage"] as const).some((permission) => hasAdminAccess(user, permission));
  const userId = canManageMembers && requestedUserId ? requestedUserId : user.id;
  if (!await mayReadMemberData(user, userId)) return NextResponse.json({ error: "该成员数据已隐藏" }, { status: 403 });
  try {
    const rules = await getFixedPromotionRules(userId, parseAsShanghaiTime(`${date} 23:59:59`));
    return NextResponse.json({ items: getActiveFixedPromotionRules(rules, date) });
  } catch (error) {
    console.error("GET /api/promotion/fixed", error);
    return NextResponse.json({ error: "读取每日固定推广费失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthorizedUser("order:manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || !validPromotionDate(body.date) || !Array.isArray(body.items) || body.items.length === 0 || body.items.length > 200) {
    return NextResponse.json({ error: "请提供有效生效日期和店铺推广费" }, { status: 400 });
  }
  if (body.endDate != null && (!validPromotionDate(body.endDate) || body.endDate < body.date)) {
    return NextResponse.json({ error: "结束日期必须有效且不早于开始日期" }, { status: 400 });
  }
  if (body.userId && body.userId !== user.id || body.items.some((item: { userId?: string } | null) => item?.userId && item.userId !== user.id)) {
    return NextResponse.json({ error: "不允许修改其他成员的推广费" }, { status: 403 });
  }
  let items: Array<ReturnType<typeof parsePromotionAmounts> & { shopName: string }>;
  try {
    items = body.items.map((item: Record<string, unknown> | null) => {
      if (!item || typeof item.shopName !== "string" || !item.shopName.trim() || item.shopName.length > 200) throw new Error("店铺名称无效");
      return { shopName: item.shopName.trim(), ...parsePromotionAmounts(item) };
    });
    if (new Set(items.map((item) => item.shopName)).size !== items.length) throw new Error("店铺不能重复");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "推广费数据无效" }, { status: 400 });
  }
  try {
    const effectiveDate = new Date(`${body.date}T00:00:00Z`);
    const endDate = body.endDate ? new Date(`${body.endDate}T00:00:00Z`) : null;
    const result = await prisma.$transaction(items.map((item) => prisma.fixedPromotionExpense.upsert({
      where: { userId_shopName_effectiveDate: { userId: user.id, shopName: item.shopName, effectiveDate } },
      create: { userId: user.id, effectiveDate, endDate, ...item },
      update: { ...item, endDate },
    })));
    return NextResponse.json({ success: true, items: result });
  } catch (error) {
    if (isPrismaMissingTableError(error, "FixedPromotionExpense")) return NextResponse.json({ error: "数据库需升级后才能保存每日固定推广费" }, { status: 503 });
    console.error("POST /api/promotion/fixed", error);
    return NextResponse.json({ error: "保存每日固定推广费失败" }, { status: 500 });
  }
}
