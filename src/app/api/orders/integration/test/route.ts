import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { getAutoPickIntegrationConfigByUserId, normalizeAutoPickIntegrationConfig, testMaiyatianCookieConnection } from "@/lib/autoPickOrders";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const testedAt = new Date().toISOString();
    const body = await request.json().catch(() => ({}));
    const saved = await getAutoPickIntegrationConfigByUserId(session.id);
    const config = normalizeAutoPickIntegrationConfig({
      pluginBaseUrl: body?.pluginBaseUrl ?? saved.pluginBaseUrl,
      inboundApiKey: body?.inboundApiKey ?? saved.inboundApiKey,
      maiyatianCookie: body?.maiyatianCookie ?? saved.maiyatianCookie,
      maiyatianShopMappings: saved.maiyatianShopMappings,
    });

    if (!config.maiyatianCookie) {
      return NextResponse.json({ error: "请先填写麦芽田 Cookie" }, { status: 400 });
    }

    let cookieOk = false;
    let cookieMessage = "未连通";
    let cookieDetail = "";
    let shopCount = 0;

    try {
      const result = await testMaiyatianCookieConnection(config.maiyatianCookie);
      cookieOk = result.ok;
      shopCount = result.shopCount;
      cookieMessage = result.shopCount > 0 ? `Cookie 可用，读取到 ${result.shopCount} 个门店` : "Cookie 可用，但当前未读取到门店";
    } catch (error) {
      cookieMessage = error instanceof Error ? error.message : "Cookie 不可用";
      cookieDetail = error instanceof Error ? error.stack || error.message : "Unknown fetch error";
      console.error("Order integration cookie check failed", {
        userId: session.id,
        error: cookieDetail,
      });
    }

    return NextResponse.json({
      ok: cookieOk,
      testedAt,
      maiyatian: {
        ok: cookieOk,
        message: cookieMessage,
        shopCount,
        detail: cookieDetail || undefined,
      },
      legacyPlugin: {
        ok: Boolean(config.pluginBaseUrl),
        message: config.pluginBaseUrl ? "仍保留旧插件地址，可用于未迁移动作兜底" : "未配置旧插件地址",
      },
    });
  } catch (error) {
    console.error("Failed to test order integration:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to test integration",
    }, { status: 500 });
  }
}
