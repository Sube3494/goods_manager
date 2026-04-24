import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import {
  getAutoPickIntegrationConfigByUserId,
  normalizeAutoPickIntegrationConfig,
  updateAutoPickIntegrationConfigByUserId,
} from "@/lib/autoPickOrders";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAuthorizedUser("order:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const config = await getAutoPickIntegrationConfigByUserId(session.id);
    return NextResponse.json(config);
  } catch (error) {
    console.error("Failed to load order integration config:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to load integration config",
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const config = normalizeAutoPickIntegrationConfig(body);

    if (config.pluginBaseUrl && !/^https?:\/\//i.test(config.pluginBaseUrl)) {
      return NextResponse.json({ error: "插件地址必须以 http:// 或 https:// 开头" }, { status: 400 });
    }

    const saved = await updateAutoPickIntegrationConfigByUserId(session.id, config);
    return NextResponse.json(saved);
  } catch (error) {
    console.error("Failed to save order integration config:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to save integration config",
    }, { status: 500 });
  }
}
