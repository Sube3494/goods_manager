import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import {
  getAutoPickIntegrationConfigByUserId,
  normalizeAutoPickIntegrationConfig,
  updateAutoPickIntegrationConfigByUserId,
  fixHistoryShopOrdersForUser,
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

    const saved = await updateAutoPickIntegrationConfigByUserId(session.id, config);

    // 保存配置后，自动进行历史订单店铺绑定匹配修正
    try {
      await fixHistoryShopOrdersForUser(session.id);
    } catch (err) {
      console.error("Failed to auto-fix history shop orders on config save:", err);
    }

    return NextResponse.json(saved);
  } catch (error) {
    console.error("Failed to save order integration config:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to save integration config",
    }, { status: 500 });
  }
}
