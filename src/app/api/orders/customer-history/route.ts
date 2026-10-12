import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { extractCustomerPhoneTail, getCustomerMaskedPhoneDisplay } from "@/lib/customerPhoneTail";
import { getBaseAutoPickStatusDisplay } from "@/lib/autoPickOrderStatus";
import { resolveCustomerHistoryScope } from "@/lib/customerHistory";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const rawTail = String(searchParams.get("phoneTail") || "").trim();
  const currentOrderNo = String(searchParams.get("currentOrderNo") || "").trim();
  const currentOrderId = String(searchParams.get("currentOrderId") || "").trim();

  // 必须只搜索尾号（4位数字）
  const tailMatch = rawTail.match(/(\d{4})$/);
  if (!tailMatch) {
    return NextResponse.json({ error: "请提供有效的4位真实手机尾号" }, { status: 400 });
  }
  const phoneTail = tailMatch[1];
  if (!currentOrderId && !currentOrderNo) {
    return NextResponse.json({ error: "请提供当前订单以限定门店和平台" }, { status: 400 });
  }

  try {
    // 获取当前商户用户的权限配置（用于精准匹配门店名称）
    const userRecord = await prisma.user.findUnique({
      where: { id: session.id },
      select: { permissions: true },
    });
    const userPermissions = userRecord?.permissions;

    const anchorId = currentOrderId || (await prisma.autoPickOrder.findFirst({
      where: { userId: session.id, orderNo: currentOrderNo }, select: { id: true },
    }))?.id;
    const scope = anchorId ? await resolveCustomerHistoryScope(session.id, anchorId, userPermissions) : null;
    if (!scope) return NextResponse.json({ error: "当前订单不存在" }, { status: 404 });
    const { currentOrder } = scope;
    const historyOrders = await prisma.autoPickOrder.findMany({
      where: scope.where, include: { items: true }, orderBy: { orderTime: "desc" },
    });
    const matchedOrders = historyOrders.filter((order) => extractCustomerPhoneTail(order) === phoneTail);

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
        isCurrentOrder: order.id === currentOrder.id,
        items,
      };
    });

    return NextResponse.json({
      phoneTail,
      representativeMaskedPhone: representativeMaskedPhone || `****${phoneTail}`,
      totalCount: matchedOrders.length,
      totalActualPaidYuan: (totalActualPaidCents / 100).toFixed(2),
      orders: formattedOrders,
      platform: currentOrder.platform,
      matchBasis: scope.matchBasis,
    });
  } catch (error) {
    console.error("[CustomerHistoryAPI] Failed to fetch customer history:", error);
    return NextResponse.json({ error: "查询老客历史订单失败" }, { status: 500 });
  }
}
