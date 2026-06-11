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
    const [config, unresolvedCount] = await Promise.all([
      getAutoPickIntegrationConfigByUserId(session.id),
      prisma.autoPickOrder.count({
        where: {
          userId: session.id,
          shopId: null,
          NOT: {
            status: {
              in: ["已取消", "已删除", "cancel", "cancelled", "delete", "deleted"]
            }
          }
        }
      })
    ]);

    return NextResponse.json({
      ...config,
      hasUnresolvedShops: unresolvedCount > 0
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

    // 重新统计是否依然有未能成功绑定店铺的有效订单
    const unresolvedCount = await prisma.autoPickOrder.count({
      where: {
        userId: session.id,
        shopId: null,
        NOT: {
          status: {
            in: ["已取消", "已删除", "cancel", "cancelled", "delete", "deleted"]
          }
        }
      }
    });

    return NextResponse.json({
      ...saved,
      hasUnresolvedShops: unresolvedCount > 0
    });
  } catch (error) {
    console.error("Failed to save order integration config:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to save integration config",
    }, { status: 500 });
  }
}
