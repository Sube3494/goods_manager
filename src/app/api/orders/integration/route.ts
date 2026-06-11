import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
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
    const [config, systemShops] = await Promise.all([
      getAutoPickIntegrationConfigByUserId(session.id),
      prisma.shop.findMany({
        where: { userId: session.id },
        select: { name: true }
      })
    ]);

    const shopNames = new Set(systemShops.map(s => s.name.trim()));
    const mappings = config?.maiyatianShopMappings || [];
    let hasUnresolvedShops = false;
    for (const mapping of mappings) {
      const localName = String(mapping.localShopName || "").trim();
      if (localName && !shopNames.has(localName)) {
        hasUnresolvedShops = true;
        break;
      }
    }

    return NextResponse.json({
      ...config,
      hasUnresolvedShops
    });
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

    // 重新比对保存后的门店映射与现存店铺列表，判断是否存在失效映射
    const systemShops = await prisma.shop.findMany({
      where: { userId: session.id },
      select: { name: true }
    });
    const shopNames = new Set(systemShops.map(s => s.name.trim()));
    const mappings = saved?.maiyatianShopMappings || [];
    
    let hasUnresolvedShops = false;
    for (const mapping of mappings) {
      const localName = String(mapping.localShopName || "").trim();
      if (localName && !shopNames.has(localName)) {
        hasUnresolvedShops = true;
        break;
      }
    }

    return NextResponse.json({
      ...saved,
      hasUnresolvedShops
    });
  } catch (error) {
    console.error("Failed to save order integration config:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to save integration config",
    }, { status: 500 });
  }
}
