import { mayReadMemberData } from "@/lib/memberDataVisibilityServer";
import { NextResponse } from "next/server";
import { getAuthorizedAdmin } from "@/lib/auth";
import { getAutoPickIntegrationConfigByUserId, testMaiyatianCookieConnection } from "@/lib/autoPickOrders";
import { checkMaiyatianCookieStatus } from "@/lib/maiyatianCookieStatus";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedAdmin("members:orders");
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await context.params;
  if (!await mayReadMemberData(session, id)) return NextResponse.json({ error: "该成员数据已隐藏" }, { status: 403 });
  try {
    const config = await getAutoPickIntegrationConfigByUserId(id);
    const status = await checkMaiyatianCookieStatus(config, testMaiyatianCookieConnection);
    return NextResponse.json({
      status,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "检测失败，请稍后重试" }, { status: 502 });
  }
}
