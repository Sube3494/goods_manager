import { NextResponse } from "next/server";
import { getAuthorizedAdmin } from "@/lib/auth";
import { getAutoPickIntegrationConfigByUserId, testMaiyatianCookieConnection } from "@/lib/autoPickOrders";
import { checkMaiyatianCookieStatus } from "@/lib/maiyatianCookieStatus";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await getAuthorizedAdmin("members:orders")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await context.params;
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
