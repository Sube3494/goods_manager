import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser, getAuthorizedUserAny } from "@/lib/auth";
import { Prisma } from "../../../../../prisma/generated-client";
import { returnOutboundOrderById } from "@/lib/outboundReturns";
import { cancelAutoCompleteJob } from "@/lib/autoPickAutoComplete";
import {
  getAutoPickIntegrationConfigByUserId,
  normalizeAutoPickOrderPayload,
  readCustomerMaskedPhoneFromRawPayload,
  readCustomerNameFromRawPayload,
  readCustomerPhoneFromRawPayload,
  readCustomerPhoneExtensionFromRawPayload,
  readCustomerRemarkFromRawPayload,
  readCustomerTypeFromRawPayload,
  readRiderPhoneFromDelivery,
  readRiderPhoneFromRawPayload,
  syncAutoOutboundFromCompletedAutoPickOrder,
  syncBrushOrderFromCompletedAutoPickOrder,
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
    const normalized = normalizeAutoPickOrderPayload(order.rawPayload);
    const customerType = readCustomerTypeFromRawPayload(order.rawPayload)
      || normalized?.customerType
      || null;

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
        customerType,
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
        orderNo: true,
        platform: true,
        actualPaid: true,
        expectedIncome: true,
        platformCommission: true,
        delivery: true,
        rawPayload: true,
        shopId: true,
        shopAddress: true,
        items: {
          select: {
            id: true,
            productName: true,
            productNo: true,
            platformSkuId: true,
            quantity: true,
            thumb: true,
            rawPayload: true,
          },
        },
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
      const inputMaiyatianShopName = String(body.maiyatianShopName || body.shopName || "").trim();
      const inputShopId = body.shopId ? String(body.shopId).trim() : null;
      const inputShopAddress = String(body.shopAddress || "").trim();

      if (inputMaiyatianShopName || inputShopId) {
        // 尝试从用户的麦芽田映射配置中反查绑定的系统本地门店
        const userConfig = await getAutoPickIntegrationConfigByUserId(user.id);

        const mappings = Array.isArray(userConfig?.maiyatianShopMappings)
          ? (userConfig.maiyatianShopMappings as Array<{ maiyatianShopId?: string; maiyatianShopName?: string; localShopName?: string }>)
          : [];

        const matchedMapping = mappings.find(
          (m) =>
            (inputShopId && String(m.maiyatianShopId || "").trim() === inputShopId) ||
            (inputMaiyatianShopName && String(m.maiyatianShopName || "").trim() === inputMaiyatianShopName)
        );

        const localShopNameToMatch = matchedMapping?.localShopName || inputMaiyatianShopName;

        if (localShopNameToMatch || inputShopId) {
          const matchedDbShop = await prisma.shop.findFirst({
            where: {
              userId: user.id,
              OR: [
                ...(inputShopId ? [{ id: inputShopId }] : []),
                ...(localShopNameToMatch ? [{ name: localShopNameToMatch }] : []),
              ],
            },
            select: { id: true, name: true, address: true },
          });

          if (matchedDbShop) {
            targetShopId = matchedDbShop.id;
            targetShopName = matchedDbShop.name;
            targetShopAddress = inputShopAddress || matchedDbShop.address || null;
          }
        }
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
    const isManualDeliveryPlaceholderOrder =
      order.platform === "线下交易"
      && order.items.some((item) => {
        const itemRawPayload = item.rawPayload && typeof item.rawPayload === "object" && !Array.isArray(item.rawPayload)
          ? item.rawPayload as Record<string, unknown>
          : {};
        return String(item.productNo || "").trim() === "__manual_delivery_placeholder__"
          || itemRawPayload.isManualDeliveryPlaceholder === true
          || String(item.productName || "").trim() === "手工配送占位商品";
      });

    const isOfflineOrder = order.platform === "线下交易";
    const actualPaid = offlineEdit
      ? Math.round(offlineActualPaid)
      : (hasAmountEdit && isOfflineOrder
        ? Math.round(nextExpectedIncome)
        : order.actualPaid);
    const expectedIncome = offlineEdit
      ? Math.round(offlineActualPaid)
      : (hasExpectedIncome
        ? Math.round(nextExpectedIncome)
        : (isOfflineOrder && Number(order.actualPaid || 0) > 0 ? order.actualPaid : order.expectedIncome));
    const platformCommission = hasAmountEdit
      ? (isOfflineOrder || isManualDeliveryPlaceholderOrder ? 0 : Math.max(0, Math.round(Number(actualPaid || 0) - Number(expectedIncome || 0))))
      : offlineEdit || isOfflineOrder
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
    const hasOfflineItems = offlineEdit && Array.isArray(offlineEdit.items);
    const offlineItems = hasOfflineItems ? (offlineEdit.items as Array<any>) : null;

    await prisma.$transaction(async (tx) => {
      if (offlineItems !== null) {
        // 1. 先清理或回滚原有关联出库单
        const existingOutbounds = await tx.outboundOrder.findMany({
          where: {
            userId: user.id,
            note: {
              contains: `平台单号: ${order.orderNo}`,
              mode: "insensitive",
            },
          },
          select: { id: true, note: true },
        });

        const filteredOutbounds = existingOutbounds.filter((outbound: any) => {
          const match = outbound.note?.match(/平台单号:\s*([^\s|]+)/);
          if (!match) return false;
          return match[1].toLowerCase() === order.orderNo.toLowerCase();
        });

        if (filteredOutbounds.length > 0) {
          await tx.outboundOrder.deleteMany({
            where: {
              id: { in: filteredOutbounds.map((o: any) => o.id) },
            },
          });
        }

        // 2. 同步 items：删除已移除的 item，更新已有的，创建新加的
        const incomingItemIds = new Set(
          offlineItems.map((item) => String(item.id || "").trim()).filter(Boolean)
        );

        await tx.autoPickOrderItem.deleteMany({
          where: {
            orderId: order.id,
            id: { notIn: Array.from(incomingItemIds) },
          },
        });

        const resolvedShopName = (rawPayload?.systemMeta?.resolvedShop?.name as string) || "";
        for (const item of offlineItems) {
          const rawId = String(item.id || "").trim();
          const pName = String(item.productName || "").trim();
          if (!pName) continue;
          const pNo = item.productNo ? String(item.productNo).trim() : null;
          const pQty = Math.max(1, Number(item.quantity) || 1);
          const pThumb = item.thumb ? String(item.thumb).trim() : null;
          const resolvedProductId = String(item.productId || item.sourceProductId || "").trim();
          const resolvedShopProductId = item.shopProductId ? String(item.shopProductId).trim() : null;

          const itemRawPayload: Record<string, any> = {
            ...(resolvedProductId || resolvedShopProductId ? {
              manualMatchedProduct: {
                id: resolvedProductId || resolvedShopProductId || rawId,
                name: pName,
                sku: pNo,
                image: pThumb,
                sourceType: item.sourceType === "shopProduct" ? "shopProduct" : "product",
                shopProductId: resolvedShopProductId || undefined,
                shopName: resolvedShopName || null,
                isManual: true,
              },
            } : {}),
          };

          if (rawId && order.items.some((existing) => existing.id === rawId)) {
            const existingItem = order.items.find((existing) => existing.id === rawId);
            const existingPayload = existingItem?.rawPayload && typeof existingItem.rawPayload === "object" && !Array.isArray(existingItem.rawPayload)
              ? existingItem.rawPayload as Record<string, any>
              : {};
            await tx.autoPickOrderItem.update({
              where: { id: rawId },
              data: {
                productName: pName,
                productNo: pNo,
                platformSkuId: existingItem?.platformSkuId || null,
                quantity: pQty,
                thumb: pThumb,
                rawPayload: {
                  ...existingPayload,
                  ...itemRawPayload,
                } as Prisma.InputJsonValue,
              },
            });
          } else {
            await tx.autoPickOrderItem.create({
              data: {
                orderId: order.id,
                productName: pName,
                productNo: pNo,
                platformSkuId: null,
                quantity: pQty,
                thumb: pThumb,
                rawPayload: itemRawPayload as Prisma.InputJsonValue,
              },
            });
          }
        }
      }

      await tx.autoPickOrder.update({
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
                shopAddress: targetShopAddress,
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
          ...(hasBrushToggle && !Boolean(body.isMainSystemSelfDelivery)
            ? { autoCompleteAt: null }
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
                    ...(Boolean(body.isMainSystemSelfDelivery)
                      ? {
                          autoOutbound: {
                            status: "skipped",
                            error: "brush-order-no-auto-outbound",
                            resolvedAt: new Date().toISOString(),
                          },
                        }
                      : {}),
                  }
                : {}),
              ...(hasAmountEdit
                ? {
                    manualAmountOverride: {
                      ...manualAmountOverride,
                      actualPaid: isOfflineOrder ? actualPaid : manualAmountOverride.actualPaid,
                      expectedIncome,
                      platformCommission,
                      onlyExpectedIncome: isOfflineOrder || isManualDeliveryPlaceholderOrder || manualAmountOverride.onlyExpectedIncome === true,
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
    });

    if (hasAmountEdit || offlineEdit) {
      await syncAutoOutboundFromCompletedAutoPickOrder(user.id, order.id).catch((error) => {
        console.error("Failed to auto-create outbound after order edit:", error);
      });
    }

    let brushSyncResult: Awaited<ReturnType<typeof syncBrushOrderFromCompletedAutoPickOrder>> | null = null;
    let removedBrushOrderCount = 0;

    if (hasBrushToggle) {
      if (Boolean(body.isMainSystemSelfDelivery)) {
        brushSyncResult = await syncBrushOrderFromCompletedAutoPickOrder(user.id, order.id, {
          allowSelfDeliveryFallback: true,
          forceInclude: true,
          overwriteExisting: true,
        });
      } else {
        const deleteResult = await prisma.brushOrder.deleteMany({
          where: {
            userId: user.id,
            platformOrderId: order.orderNo,
          },
        });
        removedBrushOrderCount = deleteResult.count;

        await cancelAutoCompleteJob(order.id, "manual-unmark-brush").catch((error) => {
          console.error("Failed to cancel auto complete job after unmarking brush:", error);
        });
      }
    }

    return NextResponse.json({
      ok: true,
      isMainSystemSelfDelivery: hasBrushToggle ? Boolean(body.isMainSystemSelfDelivery) : undefined,
      autoCompleteAt: hasBrushToggle && !Boolean(body.isMainSystemSelfDelivery) ? null : undefined,
      brushSync: brushSyncResult,
      removedBrushOrderCount: hasBrushToggle && !Boolean(body.isMainSystemSelfDelivery) ? removedBrushOrderCount : undefined,
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
