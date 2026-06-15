import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { createOutboundFromAutoPickOrder } from "@/lib/autoPickOrders";
import { parseAsShanghaiTime } from "@/lib/dateUtils";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) {
    return NextResponse.json({ error: "权限不足，请重新登录" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const {
      shopId,
      orderTime,
      orderNo,
      actualPaid, // 顾客实付（元，支持两位小数）
      deliveryFee = 0, // 配送费（元，支持两位小数）
      userAddress = "",
      note = "",
      items = [],
      autoOutbound = true, // 录入后直接自动生成出库单（扣库存）
    } = body;

    // 基础校验
    if (!shopId) {
      return NextResponse.json({ error: "请选择归属店铺" }, { status: 400 });
    }
    if (actualPaid === undefined || isNaN(Number(actualPaid)) || Number(actualPaid) < 0) {
      return NextResponse.json({ error: "请输入有效的顾客实付金额" }, { status: 400 });
    }
    if (isNaN(Number(deliveryFee)) || Number(deliveryFee) < 0) {
      return NextResponse.json({ error: "请输入有效的配送费" }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "请至少添加一个商品" }, { status: 400 });
    }

    // 检查商品数据是否完整
    for (const item of items) {
      if (!item.productId) {
        return NextResponse.json({ error: "商品列表中存在无效的商品关联" }, { status: 400 });
      }
      if (!item.productName) {
        return NextResponse.json({ error: "商品名称不能为空" }, { status: 400 });
      }
      if (!item.quantity || isNaN(Number(item.quantity)) || Number(item.quantity) <= 0 || !Number.isInteger(Number(item.quantity))) {
        return NextResponse.json({ error: `商品“${item.productName}”的数量必须为正整数` }, { status: 400 });
      }
    }

    // 查询店铺信息
    const shop = await prisma.shop.findFirst({
      where: {
        id: shopId,
        userId: session.id,
      },
    });
    if (!shop) {
      return NextResponse.json({ error: "所选店铺不存在或已删除" }, { status: 400 });
    }

    // 生成唯一的线下订单号 (如果用户未填写)
    let finalOrderNo = String(orderNo || "").trim();
    if (!finalOrderNo) {
      const timestamp = Date.now();
      const rand = Math.floor(1000 + Math.random() * 9000);
      finalOrderNo = `OFFLINE-${timestamp}-${rand}`;
    }

    // 防重检查
    const existingOrder = await prisma.autoPickOrder.findUnique({
      where: {
        userId_platform_orderNo: {
          userId: session.id,
          platform: "线下交易",
          orderNo: finalOrderNo,
        },
      },
    });
    if (existingOrder) {
      return NextResponse.json({ error: `订单号为“${finalOrderNo}”的订单已存在，请勿重复录入` }, { status: 409 });
    }

    // 时间处理
    const finalOrderTime = orderTime ? parseAsShanghaiTime(orderTime) : new Date();

    // 金额换算（元转分）
    // 线下订单里 actualPaid 表示顾客支付的商品金额；
    // deliveryFee 表示商家承担的配送支出，不应加到顾客实付里。
    const goodsCents = Math.round(Number(actualPaid) * 100);
    const deliveryCents = Math.round(Number(deliveryFee) * 100);
    const actualPaidCents = goodsCents; // 顾客实付 = 商品金额
    const expectedIncomeCents = goodsCents; // 商家到手 = 商品金额（配送费作为后续支出单独扣减）

    // 构造 payload 信息，包括 resolvedShop 信息，保证 createOutboundFromAutoPickOrder 出库时直接命中店铺
    const rawPayload = {
      isManualOffline: true,
      systemMeta: {
        resolvedShop: {
          id: shop.id,
          name: shop.name,
        },
      },
    };

    // 开启数据库事务写入订单
    const order = await prisma.$transaction(async (tx) => {
      // 计算当天已有的线下订单数量，生成每日递增的流水号
      const startOfDay = new Date(finalOrderTime);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(finalOrderTime);
      endOfDay.setHours(23, 59, 59, 999);

      const countTodayOffline = await tx.autoPickOrder.count({
        where: {
          userId: session.id,
          platform: "线下交易",
          orderTime: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      });

      const dailySequence = countTodayOffline + 1;
      const defaultAddress = deliveryCents > 0 ? "线下送货上门" : "线下柜台交易";

      const newOrder = await tx.autoPickOrder.create({
        data: {
          userId: session.id,
          sourceId: finalOrderNo,
          platform: "线下交易",
          orderNo: finalOrderNo,
          orderTime: finalOrderTime,
          userAddress: userAddress || defaultAddress,
          shopId: shop.id,
          shopAddress: shop.address || "",
          status: "已完成",
          actualPaid: actualPaidCents,
          expectedIncome: expectedIncomeCents,
          platformCommission: 0,
          dailyPlatformSequence: dailySequence,
          delivery: {
            sendFee: deliveryCents,
            isOffline: true,
          },
          rawPayload: rawPayload,
          items: {
            create: items.map((item) => {
              // 构造单项商品的手动映射，存放在 item 的 rawPayload 中
              const itemRawPayload = {
                manualMatchedProduct: {
                  id: item.productId, // 必须存放主商品 cuid 供自动出库逻辑读取
                  name: item.productName,
                  sku: item.productNo || null,
                  image: item.thumb || null,
                  sourceType: item.sourceType || "product",
                  shopName: shop.name,
                  isManual: true,
                },
              };

              return {
                productName: item.productName,
                productNo: item.productNo || null,
                quantity: Number(item.quantity),
                thumb: item.thumb || null,
                rawPayload: itemRawPayload,
              };
            }),
          },
        },
        include: {
          items: true,
        },
      });

      return newOrder;
    });

    // 如果勾选了自动出库，并且成功创建了订单，执行库存扣减
    let outboundResult = null;
    if (autoOutbound) {
      try {
        const attemptedAt = new Date().toISOString();
        const result = await createOutboundFromAutoPickOrder(session.id, order.id, {
          requireCompleted: false,
          preferredMappedShopName: shop.name,
        });

        if (result.ok) {
          outboundResult = {
            success: true,
            outboundOrderId: result.outboundOrderId,
          };
          // 在 rawPayload 记录出库状态
          await prisma.autoPickOrder.update({
            where: { id: order.id },
            data: {
              rawPayload: {
                ...rawPayload,
                systemMeta: {
                  ...rawPayload.systemMeta,
                  autoOutbound: {
                    status: "success",
                    attemptedAt,
                    resolvedAt: new Date().toISOString(),
                    outboundOrderId: result.outboundOrderId,
                  },
                },
              },
            },
          });
        } else {
          const failureMessage = result.reason === "no-items"
            ? "订单没有可生成出库的商品"
            : result.reason === "insufficient-stock"
              ? (
                  Array.isArray(result.insufficientItems) && result.insufficientItems.length > 0
                    ? `库存不足，请先创建采购单：${result.insufficientItems.map((item) => `${item.name} 缺 ${item.missingQuantity} 件`).join("；")}`
                    : "库存不足，请先创建采购单"
                )
              : "自动生成出库单失败";
          outboundResult = {
            success: false,
            reason: result.reason,
          };
          await prisma.autoPickOrder.update({
            where: { id: order.id },
            data: {
              rawPayload: {
                ...rawPayload,
                systemMeta: {
                  ...rawPayload.systemMeta,
                  autoOutbound: {
                    status: "failed",
                    attemptedAt,
                    error: failureMessage,
                  },
                },
              },
            },
          }).catch(() => null);
        }
      } catch (outboundErr) {
        console.error("Auto outbound failed for manual offline order:", outboundErr);
        outboundResult = {
          success: false,
          error: outboundErr instanceof Error ? outboundErr.message : "自动生成出库单失败",
        };
        // 记录出库失败状态到订单的 systemMeta 属性中
        await prisma.autoPickOrder.update({
          where: { id: order.id },
          data: {
            rawPayload: {
              ...rawPayload,
              systemMeta: {
                ...rawPayload.systemMeta,
                autoOutbound: {
                  status: "failed",
                  attemptedAt: new Date().toISOString(),
                  error: outboundErr instanceof Error ? outboundErr.message : "出库处理异常",
                },
              },
            },
          },
        }).catch(() => null);
      }
    }

    return NextResponse.json({
      ok: true,
      orderId: order.id,
      orderNo: order.orderNo,
      outbound: outboundResult,
    });
  } catch (error) {
    console.error("Failed to create manual offline order:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "内部服务器错误，保存订单失败",
    }, { status: 500 });
  }
}
