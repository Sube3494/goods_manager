import { NextResponse } from "next/server";
import { getAuthorizedAdmin } from "@/lib/auth";
import { getAutoPickIntegrationConfigByUserId, testMaiyatianCookieConnection } from "@/lib/autoPickOrders";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await getAuthorizedAdmin("members:orders")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await context.params;
  try {
    const config = await getAutoPickIntegrationConfigByUserId(id);
    const cookies = (config.maiyatianCookies || []).filter((a) => a.enabled !== false && a.cookie.trim()).map((a) => a.cookie);
    if (!cookies.length && config.maiyatianCookie.trim()) cookies.push(config.maiyatianCookie);
    const results = await Promise.allSettled(cookies.map(testMaiyatianCookieConnection));
    const success = results.filter((r) => r.status === "fulfilled" && r.value.ok).length;
    return NextResponse.json({
      status: !cookies.length ? "missing" : success === cookies.length ? "valid" : success ? "partial" : "invalid",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "检测失败，请稍后重试" }, { status: 502 });
  }
}
