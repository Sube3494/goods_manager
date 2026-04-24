import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { getAutoPickIntegrationConfigByUserId, normalizeAutoPickIntegrationConfig } from "@/lib/autoPickOrders";

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
    });

    if (!config.pluginBaseUrl) {
      return NextResponse.json({ error: "请先填写插件地址" }, { status: 400 });
    }

    const healthUrl = `${config.pluginBaseUrl.replace(/\/+$/, "")}/health`;
    const callbackUrl = new URL("/api/v1/api-key/listened-orders", request.url).toString();

    let pluginOk = false;
    let pluginStatus: number | null = null;
    let pluginMessage = "未连通";
    let pluginDetail = "";

    try {
      const response = await fetch(healthUrl, {
        method: "GET",
        cache: "no-store",
      });
      pluginOk = response.ok;
      pluginStatus = response.status;
      const responseText = await response.text().catch(() => "");
      pluginMessage = response.ok ? "插件服务可访问" : `插件返回 ${response.status}`;
      pluginDetail = responseText.trim().slice(0, 300);

      if (!response.ok) {
        console.warn("Order integration health check returned non-OK response", {
          userId: session.id,
          healthUrl,
          status: response.status,
          body: pluginDetail || null,
        });
      }
    } catch (error) {
      pluginMessage = error instanceof Error ? error.message : "插件服务不可访问";
      pluginDetail = error instanceof Error ? error.stack || error.message : "Unknown fetch error";
      console.error("Order integration health check failed", {
        userId: session.id,
        healthUrl,
        error: pluginDetail,
      });
    }

    return NextResponse.json({
      ok: pluginOk,
      testedAt,
      plugin: {
        ok: pluginOk,
        status: pluginStatus,
        message: pluginMessage,
        healthUrl,
        detail: pluginDetail || undefined,
      },
      callback: {
        ok: true,
        url: callbackUrl,
      },
      key: {
        ok: Boolean(config.inboundApiKey),
        message: config.inboundApiKey ? "已填写对接密钥" : "未填写对接密钥",
      },
    });
  } catch (error) {
    console.error("Failed to test order integration:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to test integration",
    }, { status: 500 });
  }
}
