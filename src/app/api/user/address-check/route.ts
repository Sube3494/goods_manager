import { NextResponse } from "next/server";
import { getFreshSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { SessionUser } from "@/lib/permissions";

/**
 * GET /api/user/address-check?addressId=xxx
 * 查询指定地址是否存在关联数据（商品/订单），决定能否删除
 */
export async function GET(req: Request) {
  try {
    const session = (await getFreshSession()) as SessionUser | null;
    if (!session || !session.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const addressId = searchParams.get("addressId");
    if (!addressId) {
      return NextResponse.json({ error: "缺少 addressId 参数" }, { status: 400 });
    }

    // 找到对应的 Shop
    const shop = await prisma.shop.findFirst({
      where: { userId: session.id, addressBookId: addressId },
      select: { id: true, name: true },
    });

    if (!shop) {
      // 没有对应门店，可以安全删除
      return NextResponse.json({ canDelete: true, shopProductCount: 0, orderCount: 0 });
    }

    // 查关联的商品数和订单数
    const [shopProductCount, orderCount] = await Promise.all([
      prisma.shopProduct.count({ where: { shopId: shop.id } }),
      prisma.autoPickOrder.count({ where: { shopId: shop.id } }),
    ]);

    const canDelete = shopProductCount === 0 && orderCount === 0;

    return NextResponse.json({
      canDelete,
      shopName: shop.name,
      shopProductCount,
      orderCount,
    });
  } catch (error) {
    console.error("Address check failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
