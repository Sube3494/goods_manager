import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { extractCustomerPhoneTail, getCustomerMaskedPhoneDisplay } from "@/lib/customerPhoneTail";
import { getBaseAutoPickStatusDisplay } from "@/lib/autoPickOrderStatus";
import { resolveAutoPickMatchedShopName } from "@/lib/autoPickOrders";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const rawTail = String(searchParams.get("phoneTail") || "").trim();
  const currentOrderNo = String(searchParams.get("currentOrderNo") || "").trim();
  const rawShopName = String(searchParams.get("shopName") || "").trim();
  const rawShopId = String(searchParams.get("shopId") || "").trim();

  // 必须只搜索尾号（4位数字）
  const tailMatch = rawTail.match(/(\d{4})$/);
  if (!tailMatch) {
    return NextResponse.json({ error: "请提供有效的4位真实手机尾号" }, { status: 400 });
  }
  const phoneTail = tailMatch[1];

  try {
    // 获取当前商户用户的权限配置（用于精准匹配门店名称）
    const userRecord = await prisma.user.findUnique({
      where: { id: session.id },
      select: { permissions: true },
    });
    const userPermissions = userRecord?.permissions;

    // 若未直接传入 shopName 但提供了当前订单号，先查询当前订单获取其门店名称
    let targetShopName = rawShopName || null;
    if (!targetShopName && currentOrderNo) {
      const currentOrder = await prisma.autoPickOrder.findFirst({
        where: {
          orderNo: currentOrderNo,
          userId: session.id,
        },
        select: { shopId: true, rawPayload: true },
      });
      if (currentOrder) {
        targetShopName = resolveAutoPickMatchedShopName(currentOrder, userPermissions) || null;
      }
    }

    // 严格限定在当前用户账号（绝不跨商户账号），读取所有历史订单
    const allOrders = await prisma.autoPickOrder.findMany({
      where: {
        userId: session.id,
      },
      include: {
        items: true,
      },
      orderBy: {
        orderTime: "desc",
      },
    });

    // 过滤同门店与同真实尾号
    const matchedOrders = allOrders.filter((order) => {
      // 1. 真实尾号严格匹配
      const tail = extractCustomerPhoneTail(order);
      if (tail !== phoneTail) {
        return false;
      }

      // 2. 门店归属过滤（同商户同门店）：
      // 如果指定了门店名称（例如“南山店”），判定候选订单是否也属于该门店
      if (targetShopName && targetShopName !== "未绑定店铺" && targetShopName !== "未绑定门店") {
        const orderShopName = resolveAutoPickMatchedShopName(order, userPermissions);
        // 如果候选订单有匹配的门店名称，要求与目标门店一致
        if (orderShopName && orderShopName !== targetShopName) {
          // 容错：如果两者的 shopId 一致，仍视为同店
          const isSameShopId = rawShopId && order.shopId && rawShopId === order.shopId;
          if (!isSameShopId) {
            return false;
          }
        }
      }

      return true;
    });

    // 统计数据
    let totalActualPaidCents = 0;
    let representativeMaskedPhone = "";

    const formattedOrders = matchedOrders.map((order) => {
      totalActualPaidCents += Number(order.actualPaid || 0);
      const maskedPhone = getCustomerMaskedPhoneDisplay(order);
      if (maskedPhone && !representativeMaskedPhone) {
        representativeMaskedPhone = maskedPhone;
      }

      // 处理商品明细
      const items = (order.items || []).map((item) => {
        const itemRaw = (item.rawPayload && typeof item.rawPayload === "object")
          ? item.rawPayload as Record<string, unknown>
          : null;
        const imageUrl = String(
          item.thumb || itemRaw?.thumb || itemRaw?.image || itemRaw?.pic || itemRaw?.picture || ""
        ).trim();
        const spec = String(itemRaw?.spec || itemRaw?.goods_spec || "").trim();
        const priceCents = Number(itemRaw?.price || itemRaw?.goods_price || itemRaw?.total_fee || 0);

        return {
          id: item.id,
          productName: item.productName || "未知商品",
          productNo: item.productNo,
          spec,
          quantity: item.quantity || 1,
          price: priceCents > 0 ? (priceCents / 100).toFixed(2) : null,
          imageUrl: imageUrl || null,
        };
      });

      return {
        id: order.id,
        orderNo: order.orderNo,
        platform: order.platform,
        orderTime: order.orderTime,
        status: order.status,
        statusDisplay: getBaseAutoPickStatusDisplay(order.status),
        actualPaid: order.actualPaid,
        actualPaidYuan: (Number(order.actualPaid || 0) / 100).toFixed(2),
        expectedIncome: order.expectedIncome,
        userAddress: order.userAddress,
        customerRemark: order.customerRemark,
        customerName: (order.rawPayload as Record<string, unknown> | null)?.customerName || null,
        maskedPhone: maskedPhone || null,
        isCurrentOrder: Boolean(currentOrderNo && order.orderNo === currentOrderNo),
        items,
      };
    });

    return NextResponse.json({
      phoneTail,
      representativeMaskedPhone: representativeMaskedPhone || `****${phoneTail}`,
      totalCount: matchedOrders.length,
      totalActualPaidYuan: (totalActualPaidCents / 100).toFixed(2),
      orders: formattedOrders,
    });
  } catch (error) {
    console.error("[CustomerHistoryAPI] Failed to fetch customer history:", error);
    return NextResponse.json({ error: "查询老客历史订单失败" }, { status: 500 });
  }
}
