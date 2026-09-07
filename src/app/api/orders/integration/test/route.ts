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
    const specificAccountId = body?.accountId ? String(body.accountId).trim() : null;
    const specificCookie = body?.cookie ? String(body.cookie).trim() : null;

    const saved = await getAutoPickIntegrationConfigByUserId(session.id);
    const config = normalizeAutoPickIntegrationConfig({
      pluginBaseUrl: body?.pluginBaseUrl ?? saved.pluginBaseUrl,
      inboundApiKey: body?.inboundApiKey ?? saved.inboundApiKey,
      maiyatianCookie: body?.maiyatianCookie ?? saved.maiyatianCookie,
      maiyatianCookies: body?.maiyatianCookies ?? saved.maiyatianCookies,
      maiyatianShopMappings: saved.maiyatianShopMappings,
    });

    // 确定待测试的账号列表
    let accountsToTest = config.maiyatianCookies || [];
    if (specificCookie) {
      accountsToTest = [{
        id: specificAccountId || "custom",
        name: body?.accountName ? String(body.accountName).trim() : "指定账号",
        cookie: specificCookie,
        enabled: true,
      }];
    } else if (specificAccountId) {
      const found = accountsToTest.find((a) => a.id === specificAccountId);
      if (found) {
        accountsToTest = [found];
      }
    }

    if ((target === "cookie" || target === "all") && accountsToTest.length === 0 && !config.maiyatianCookie) {
      return NextResponse.json({ error: "请先填写麦芽田 Cookie" }, { status: 400 });
    }

    let cookieOk = false;
    let cookieMessage = "未连通";
    let cookieDetail = "";
    let totalShopCount = 0;
    const accountResults: Array<{
      id: string;
      name: string;
      ok: boolean;
      message: string;
      shopCount: number;
      detail?: string;
    }> = [];

    if (target === "cookie" || target === "all") {
      for (const account of accountsToTest) {
        if (!account.cookie.trim()) {
          accountResults.push({
            id: account.id,
            name: account.name,
            ok: false,
            message: "未填写 Cookie",
            shopCount: 0,
          });
          continue;
        }

        try {
          const result = await testMaiyatianCookieConnection(account.cookie);
          totalShopCount += result.shopCount;
          accountResults.push({
            id: account.id,
            name: account.name,
            ok: result.ok,
            message: result.shopCount > 0 ? `可用，读取到 ${result.shopCount} 个门店` : "可用，但未读取到门店",
            shopCount: result.shopCount,
          });
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : "Cookie 不可用";
          accountResults.push({
            id: account.id,
            name: account.name,
            ok: false,
            message: errMsg,
            shopCount: 0,
            detail: error instanceof Error ? error.stack : undefined,
          });
        }
      }

      // 综合判定
      if (accountResults.length > 0) {
        cookieOk = accountResults.some((r) => r.ok);
        const successCount = accountResults.filter((r) => r.ok).length;
        if (successCount === accountResults.length) {
          cookieMessage = `全部 ${accountResults.length} 个账号均连通，共读取到 ${totalShopCount} 个门店`;
        } else if (successCount > 0) {
          cookieMessage = `${successCount}/${accountResults.length} 个账号连通，共读取到 ${totalShopCount} 个门店`;
        } else {
          cookieMessage = accountResults[0]?.message || "Cookie 均不可用";
          cookieDetail = accountResults[0]?.detail || "";
        }
      } else if (config.maiyatianCookie) {
        try {
          const result = await testMaiyatianCookieConnection(config.maiyatianCookie);
          cookieOk = result.ok;
          totalShopCount = result.shopCount;
          cookieMessage = result.shopCount > 0 ? `Cookie 可用，读取到 ${result.shopCount} 个门店` : "Cookie 可用，但当前未读取到门店";
        } catch (error) {
          cookieMessage = error instanceof Error ? error.message : "Cookie 不可用";
          cookieDetail = error instanceof Error ? error.stack || error.message : "Unknown fetch error";
        }
      }
    }

    let pluginOk = false;
    let pluginMessage = config.pluginBaseUrl ? "未检测" : "未配置脚本地址";

    if ((target === "plugin" || target === "all") && config.pluginBaseUrl) {
      try {
        const url = new URL("health", `${config.pluginBaseUrl.replace(/\/+$/, "")}/`);
        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            Accept: "application/json",
            "X-API-Key": config.inboundApiKey,
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
        shopCount: totalShopCount,
        accounts: accountResults,
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
