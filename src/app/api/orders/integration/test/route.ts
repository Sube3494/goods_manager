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
    const target = String(body?.target || "all").trim();
    const saved = await getAutoPickIntegrationConfigByUserId(session.id);
    const config = normalizeAutoPickIntegrationConfig({
      pluginBaseUrl: body?.pluginBaseUrl ?? saved.pluginBaseUrl,
      inboundApiKey: body?.inboundApiKey ?? saved.inboundApiKey,
      maiyatianCookie: body?.maiyatianCookie ?? saved.maiyatianCookie,
      maiyatianShopMappings: saved.maiyatianShopMappings,
    });

    if ((target === "cookie" || target === "all") && !config.maiyatianCookie) {
      return NextResponse.json({ error: "请先填写麦芽田 Cookie" }, { status: 400 });
    }

    let cookieOk = false;
    let cookieMessage = "未连通";
    let cookieDetail = "";
    let shopCount = 0;
    let pluginOk = false;
    let pluginMessage = config.pluginBaseUrl ? "未检测" : "未配置脚本地址";

    if (target === "cookie" || target === "all") {
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
    }

    if ((target === "plugin" || target === "all") && config.pluginBaseUrl) {
      try {
        const url = new URL("health", `${config.pluginBaseUrl.replace(/\/+$/, "")}/`);
        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          cache: "no-store",
        });
        const data = await response.json().catch(() => ({}));
        pluginOk = response.ok;
        pluginMessage = response.ok
          ? "脚本服务可用"
          : String((data as Record<string, unknown>).error || (data as Record<string, unknown>).reason || `脚本服务异常（${response.status}）`);
      } catch (error) {
        pluginMessage = error instanceof Error ? error.message : "脚本服务不可用";
      }
    }

    if (target === "plugin" && !config.pluginBaseUrl) {
      return NextResponse.json({ error: "请先填写脚本地址" }, { status: 400 });
    }

    return NextResponse.json({
      ok: target === "plugin" ? pluginOk : target === "cookie" ? cookieOk : (cookieOk && pluginOk),
      target,
      testedAt,
      maiyatian: {
        ok: cookieOk,
        message: cookieMessage,
        shopCount,
        detail: cookieDetail || undefined,
      },
      legacyPlugin: {
        ok: pluginOk,
        message: pluginMessage,
      },
    });
  } catch (error) {
    console.error("Failed to test order integration:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to test integration",
    }, { status: 500 });
  }
}
