import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser, getAuthorizedUserAny } from "@/lib/auth";
import { Prisma } from "../../../../../prisma/generated-client";
import { returnOutboundOrderById } from "@/lib/outboundReturns";
import {
  readCustomerMaskedPhoneFromRawPayload,
  readCustomerNameFromRawPayload,
  readCustomerPhoneFromRawPayload,
  readCustomerPhoneExtensionFromRawPayload,
  readCustomerRemarkFromRawPayload,
  readRiderPhoneFromDelivery,
  readRiderPhoneFromRawPayload,
} from "@/lib/autoPickOrders";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthorizedUser("order:manage");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const order = await prisma.autoPickOrder.findFirst({
      where: {
        id,
        userId: user.id,
      },
      select: {
        id: true,
        sourceId: true,
        longitude: true,
        latitude: true,
        delivery: true,
        rawPayload: true,
        customerRemark: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    }

    return NextResponse.json({
      order: {
        id: order.id,
        sourceId: order.sourceId,
        longitude: order.longitude,
        latitude: order.latitude,
        delivery: order.delivery && typeof order.delivery === "object"
          ? {
              ...(order.delivery as Record<string, unknown>),
              riderPhone: readRiderPhoneFromDelivery(order.delivery) || readRiderPhoneFromRawPayload(order.rawPayload) || undefined,
            }
          : order.delivery,
        customerName: readCustomerNameFromRawPayload(order.rawPayload),
        customerPhone: readCustomerPhoneFromRawPayload(order.rawPayload),
        customerMaskedPhone: readCustomerMaskedPhoneFromRawPayload(order.rawPayload),
        customerPhoneExtension: readCustomerPhoneExtensionFromRawPayload(order.rawPayload),
        customerRemark: order.customerRemark || readCustomerRemarkFromRawPayload(order.rawPayload),
        detailLoaded: true,
        detailLoading: false,
      },
    });
  } catch (error) {
    console.error("Failed to get order detail:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "读取订单详情失败",
    }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthorizedUser("order:manage");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));

    const hasBrushToggle = body.isMainSystemSelfDelivery !== undefined;
    const nextExpectedIncome = Number(body.expectedIncome);
    const hasExpectedIncome = Number.isFinite(nextExpectedIncome);
    const hasOfflineEdit = body.offlineEdit && typeof body.offlineEdit === "object";
    const hasAmountEdit = hasExpectedIncome;
    const hasShopEdit = body.shopId !== undefined;

    if (!hasBrushToggle && !hasAmountEdit && !hasOfflineEdit && !hasShopEdit) {
      return NextResponse.json({ error: "参数错误" }, { status: 400 });
    }

    if (hasAmountEdit) {
      if (nextExpectedIncome < 0) {
        return NextResponse.json({ error: "金额不能小于 0" }, { status: 400 });
      }
    }

    const offlineEdit = hasOfflineEdit ? body.offlineEdit as Record<string, unknown> : null;
    const offlineActualPaid = offlineEdit ? Number(offlineEdit.actualPaid) : NaN;
    const offlineDeliveryFee = offlineEdit ? Number(offlineEdit.deliveryFee) : NaN;
    const offlineUserAddress = offlineEdit ? String(offlineEdit.userAddress || "").trim() : "";
    const offlineCustomerRemark = offlineEdit ? String(offlineEdit.customerRemark || "").trim() : "";

    if (offlineEdit) {
      if (!Number.isFinite(offlineActualPaid) || offlineActualPaid < 0) {
        return NextResponse.json({ error: "商品金额不能小于 0" }, { status: 400 });
      }
      if (!Number.isFinite(offlineDeliveryFee) || offlineDeliveryFee < 0) {
        return NextResponse.json({ error: "配送支出不能小于 0" }, { status: 400 });
      }
    }

    const order = await prisma.autoPickOrder.findFirst({
      where: {
        id,
        userId: user.id,
      },
      select: {
        id: true,
        platform: true,
        actualPaid: true,
        expectedIncome: true,
        platformCommission: true,
        delivery: true,
        rawPayload: true,
        shopAddress: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    }

    if (offlineEdit && order.platform !== "线下交易") {
      return NextResponse.json({ error: "当前只支持修改线下订单" }, { status: 400 });
    }

    let targetShopId: string | null = null;
    let targetShopName: string | null = null;
    let targetShopAddress: string | null = null;

    if (hasShopEdit) {
      targetShopId = body.shopId ? String(body.shopId).trim() : null;
      if (targetShopId) {
        const matchedShop = await prisma.shop.findFirst({
          where: { id: targetShopId, userId: user.id },
          select: { id: true, name: true, address: true },
        });
        if (!matchedShop) {
          return NextResponse.json({ error: "指定的门店不存在" }, { status: 404 });
        }
        targetShopName = matchedShop.name;
        targetShopAddress = matchedShop.address || null;
      }
    }

    const rawPayload = order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)
      ? order.rawPayload as Record<string, any>
      : {};

    const systemMeta = rawPayload.systemMeta && typeof rawPayload.systemMeta === "object" && !Array.isArray(rawPayload.systemMeta)
      ? rawPayload.systemMeta as Record<string, any>
      : {};

    const mainSystemSelfDelivery = systemMeta.mainSystemSelfDelivery && typeof systemMeta.mainSystemSelfDelivery === "object" && !Array.isArray(systemMeta.mainSystemSelfDelivery)
      ? systemMeta.mainSystemSelfDelivery as Record<string, any>
      : {};

    const manualAmountOverride = systemMeta.manualAmountOverride && typeof systemMeta.manualAmountOverride === "object" && !Array.isArray(systemMeta.manualAmountOverride)
      ? systemMeta.manualAmountOverride as Record<string, any>
      : {};

    const actualPaid = offlineEdit ? Math.round(offlineActualPaid) : order.actualPaid;
    const expectedIncome = offlineEdit ? Math.round(offlineActualPaid) : (hasExpectedIncome ? Math.round(nextExpectedIncome) : order.expectedIncome);
    const platformCommission = hasAmountEdit
      ? Math.max(0, Math.round(Number(actualPaid || 0) - Number(expectedIncome || 0)))
      : offlineEdit
        ? 0
        : order.platformCommission;
    const existingDelivery = order.delivery && typeof order.delivery === "object" && !Array.isArray(order.delivery)
      ? order.delivery as Record<string, unknown>
      : {};
    const nextDelivery = offlineEdit
      ? {
          ...existingDelivery,
          sendFee: Math.round(offlineDeliveryFee),
          isOffline: true,
        }
      : null;

    await prisma.autoPickOrder.update({
      where: { id: order.id },
      data: {
        ...(hasAmountEdit
          ? {
              actualPaid,
              expectedIncome,
              platformCommission,
            }
          : {}),
        ...(hasShopEdit
          ? {
              shopId: targetShopId,
              ...(targetShopAddress !== null ? { shopAddress: targetShopAddress } : {}),
            }
          : {}),
        ...(offlineEdit
          ? {
              actualPaid,
              expectedIncome,
              platformCommission,
              userAddress: offlineUserAddress || (Math.round(offlineDeliveryFee) > 0 ? "线下送货上门" : "线下柜台交易"),
              customerRemark: offlineCustomerRemark || null,
              delivery: nextDelivery as Prisma.InputJsonValue,
            }
          : {}),
        rawPayload: {
          ...rawPayload,
          ...(offlineEdit
            ? {
                note: offlineCustomerRemark,
                customerRemark: offlineCustomerRemark,
              }
            : {}),
          systemMeta: {
            ...systemMeta,
            ...(hasBrushToggle
              ? {
                  mainSystemSelfDelivery: {
                    ...mainSystemSelfDelivery,
                    triggered: Boolean(body.isMainSystemSelfDelivery),
                  },
                }
              : {}),
            ...(hasAmountEdit
              ? {
                  manualAmountOverride: {
                    ...manualAmountOverride,
                    expectedIncome,
                    updatedAt: new Date().toISOString(),
                    updatedBy: String(user.name || user.email || user.id),
                  },
                }
              : {}),
            ...(hasShopEdit
              ? {
                  resolvedShop: {
                    id: targetShopId,
                    name: targetShopName,
                  },
                  manualShopOverride: {
                    shopId: targetShopId,
                    shopName: targetShopName,
                    updatedAt: new Date().toISOString(),
                    updatedBy: String(user.name || user.email || user.id),
                  },
                }
              : {}),
            ...(offlineEdit
              ? {
                  manualOfflineEdit: {
                    actualPaid,
                    expectedIncome,
                    deliveryFee: Math.round(offlineDeliveryFee),
                    userAddress: offlineUserAddress,
                    customerRemark: offlineCustomerRemark,
                    updatedAt: new Date().toISOString(),
                    updatedBy: String(user.name || user.email || user.id),
                  },
                }
              : {}),
          },
        } as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      ok: true,
      isMainSystemSelfDelivery: hasBrushToggle ? Boolean(body.isMainSystemSelfDelivery) : undefined,
      actualPaid,
      expectedIncome,
      platformCommission,
      ...(hasShopEdit ? { shopId: targetShopId, matchedShopName: targetShopName } : {}),
    });
  } catch (error) {
    console.error("Failed to patch order:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "更新订单失败",
    }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthorizedUserAny("order:manage", "outbound:manage");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const reason = String(body?.reason || "").trim() || "线下订单录入有误，已作废";

    const order = await prisma.autoPickOrder.findFirst({
      where: {
        id,
        userId: user.id,
      },
      select: {
        id: true,
        orderNo: true,
        platform: true,
        status: true,
        rawPayload: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    }

    if (order.platform !== "线下交易") {
      return NextResponse.json({ error: "当前只支持作废线下订单" }, { status: 400 });
    }

    if (String(order.status || "").includes("删除")) {
      return NextResponse.json({ ok: true, alreadyDeleted: true, returnedOutboundCount: 0 });
    }

    const relatedOutboundOrders = await prisma.outboundOrder.findMany({
      where: {
        userId: user.id,
        status: {
          not: "Returned",
        },
        note: {
          contains: `平台单号: ${order.orderNo}`,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        note: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const filteredOutboundOrders = relatedOutboundOrders.filter((outbound) => {
      const match = outbound.note?.match(/平台单号:\s*([^\s|]+)/);
      if (!match) return false;
      return match[1].toLowerCase() === order.orderNo.toLowerCase();
    });

    for (const outbound of filteredOutboundOrders) {
      await returnOutboundOrderById(user.id, outbound.id, `线下订单作废：${reason}`);
    }

    const rawPayload = order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)
      ? order.rawPayload as Record<string, unknown>
      : {};
    const systemMeta = rawPayload.systemMeta && typeof rawPayload.systemMeta === "object" && !Array.isArray(rawPayload.systemMeta)
      ? rawPayload.systemMeta as Record<string, unknown>
      : {};

    await prisma.autoPickOrder.update({
      where: { id: order.id },
      data: {
        status: "已删除",
        lastSyncedAt: new Date(),
        rawPayload: {
          ...rawPayload,
          systemMeta: {
            ...systemMeta,
            manualOfflineVoided: {
              reason,
              voidedAt: new Date().toISOString(),
              voidedBy: String(user.name || user.email || user.id),
              returnedOutboundCount: relatedOutboundOrders.length,
            },
          },
        } as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      ok: true,
      returnedOutboundCount: relatedOutboundOrders.length,
    });
  } catch (error) {
    console.error("Failed to delete offline order:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "作废线下订单失败",
    }, { status: 500 });
  }
}
