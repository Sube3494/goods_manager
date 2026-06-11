import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { resolveAutoPickMatchedShopName } from "@/lib/autoPickOrders";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  console.log("POST /api/orders/fix-history-shops triggered, url:", request.url);
  const session = await getAuthorizedUser("settlement:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const [user, systemShops] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.id },
        select: { permissions: true, shippingAddresses: true },
      }),
      prisma.shop.findMany({
        where: { userId: session.id }
      })
    ]);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 查询当前用户的所有订单
    const orders = await prisma.autoPickOrder.findMany({
      where: { userId: session.id },
      select: {
        id: true,
        shopId: true,
        rawPayload: true,
        platform: true,
      }
    });

    let updatedCount = 0;
    const updates = [];

    for (const order of orders) {
      const rawPayload = order.rawPayload as Record<string, any>;
      const matchedShopName = resolveAutoPickMatchedShopName(
        { shopId: order.shopId, rawPayload: order.rawPayload },
        user.permissions
      );

      const targetShop = systemShops.find(s => 
        s.name === matchedShopName || 
        s.id === order.shopId ||
        (matchedShopName === "zunyi" && s.name.includes("遵义")) ||
        (matchedShopName === "baiyun" && s.name.includes("白云"))
      );

      if (targetShop) {
        const currentResolvedShop = rawPayload?.systemMeta?.resolvedShop;
        const needUpdate = !order.shopId 
          || order.shopId !== targetShop.id 
          || !currentResolvedShop 
          || currentResolvedShop.id !== targetShop.id;

        if (needUpdate) {
          const nextSystemMeta = {
            ...(rawPayload?.systemMeta || {}),
            resolvedShop: {
              id: targetShop.id,
              name: targetShop.name,
            }
          };
          const nextRawPayload = {
            ...(rawPayload || {}),
            systemMeta: nextSystemMeta
          };

          updates.push(
            prisma.autoPickOrder.update({
              where: { id: order.id },
              data: {
                shopId: targetShop.id,
                rawPayload: nextRawPayload as any
              }
            })
          );
          updatedCount++;
        }
      }
    }

    if (updates.length > 0) {
      // 执行批量修改事务以保证原子性
      await prisma.$transaction(updates);
    }

    return NextResponse.json({
      ok: true,
      totalOrders: orders.length,
      updatedCount,
    });

  } catch (error) {
    console.error("Failed to fix history shop orders:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Internal Server Error"
    }, { status: 500 });
  }
}
