import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";

async function getOwnedShop(shopId: string, userId: string, isAdmin: boolean) {
  return prisma.shop.findFirst({
    where: isAdmin ? { id: shopId } : { id: shopId, userId },
    select: { id: true, name: true, userId: true, libraryId: true },
  });
}

// GET: 获取当前店铺相关的调拨流水（包括从本店调出和调入本店）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthorizedUser("product:read");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: shopId } = await params;
    const shop = await getOwnedShop(shopId, user.id, user.role === "SUPER_ADMIN");
    if (!shop) {
      return NextResponse.json({ error: "店铺不存在或无权访问" }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const shopProductId = searchParams.get("shopProductId");
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 20), 1), 100);

    const records = await prisma.shopTransferRecord.findMany({
      where: {
        OR: [
          { sourceShopId: shopId },
          { targetShopId: shopId },
        ],
        ...(shopProductId
          ? {
              OR: [
                { sourceShopProductId: shopProductId },
                { targetShopProductId: shopProductId },
              ],
            }
          : {}),
      },
      include: {
        sourceShop: {
          select: { id: true, name: true },
        },
        targetShop: {
          select: { id: true, name: true },
        },
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ records });
  } catch (error) {
    console.error("Failed to fetch transfer records:", error);
    return NextResponse.json({ error: "获取调拨记录失败" }, { status: 500 });
  }
}

// POST: 执行跨门店调拨
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthorizedUser("product:update");
    if (!user) {
      return NextResponse.json({ error: "权限不足，无法执行调拨操作" }, { status: 401 });
    }

    const { id: sourceShopId } = await params;
    const body = await request.json().catch(() => null);

    const shopProductId = typeof body?.shopProductId === "string" ? body.shopProductId.trim() : "";
    const targetShopId = typeof body?.targetShopId === "string" ? body.targetShopId.trim() : "";
    const targetShopProductId = typeof body?.targetShopProductId === "string" ? body.targetShopProductId.trim() : "";
    const quantity = Number(body?.quantity);
    const shippingFee = Math.max(0, Number(body?.shippingFee) || 0);
    const explicitTargetCostPrice = body?.targetCostPrice !== undefined && body?.targetCostPrice !== null && !isNaN(Number(body.targetCostPrice))
      ? Math.max(0, Number(body.targetCostPrice))
      : null;
    const remark = typeof body?.remark === "string" ? body.remark.trim() : "";

    if (!shopProductId) {
      return NextResponse.json({ error: "缺少调拨商品标识" }, { status: 400 });
    }

    if (!targetShopId) {
      return NextResponse.json({ error: "请选择目标店铺" }, { status: 400 });
    }

    if (sourceShopId === targetShopId) {
      return NextResponse.json({ error: "源店铺与目标店铺不能相同" }, { status: 400 });
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json({ error: "调拨数量必须为大于 0 的正整数" }, { status: 400 });
    }

    const isAdmin = user.role === "SUPER_ADMIN";
    const [sourceShop, targetShop] = await Promise.all([
      getOwnedShop(sourceShopId, user.id, isAdmin),
      getOwnedShop(targetShopId, user.id, isAdmin),
    ]);

    if (!sourceShop) {
      return NextResponse.json({ error: "源店铺不存在或无管理权限" }, { status: 404 });
    }

    if (!targetShop) {
      return NextResponse.json({ error: "目标店铺不存在或无管理权限" }, { status: 404 });
    }

    // 执行调拨数据库事务
    const transferResult = await prisma.$transaction(async (tx) => {
      // 1. 查询源店铺商品详情
      const sourceProduct = await tx.shopProduct.findFirst({
        where: {
          id: shopProductId,
          shopId: sourceShopId,
        },
        include: {
          product: true,
          batches: {
            where: { remainingStock: { gt: 0 } },
            orderBy: { expirationDate: "asc" },
          },
        },
      });

      if (!sourceProduct) {
        throw new Error("源店铺中未找到该商品");
      }

      if (sourceProduct.stock < quantity) {
        throw new Error(`库存不足！当前商品可用库存为 ${sourceProduct.stock} 件，无法调拨 ${quantity} 件`);
      }

      const sourceCost = Number(sourceProduct.costPrice) || 0;

      // 2. 扣减源商品物理总库存
      const updatedSourceProduct = await tx.shopProduct.update({
        where: { id: sourceProduct.id },
        data: {
          stock: { decrement: quantity },
        },
      });

      // 3. 扣减源店铺入库批次剩余库存 (FIFO 先进先出) 并记录消耗明细
      let remainingToDeduct = quantity;
      const consumedBatches: Array<{
        purchaseOrderItemId: string;
        quantity: number;
        unitCost: number;
        totalCost: number;
      }> = [];

      const sourceBatches = await tx.purchaseOrderItem.findMany({
        where: {
          AND: [
            {
              OR: [
                { shopProductId: sourceProduct.id },
                ...(sourceProduct.productId ? [{ productId: sourceProduct.productId, shopProductId: null }] : []),
              ],
            },
            {
              OR: [
                { remainingQuantity: { gt: 0 } },
                { remainingQuantity: null },
              ],
            },
            {
              purchaseOrder: {
                userId: user.id,
                status: "Received",
              },
            },
          ],
        },
        orderBy: {
          purchaseOrder: { date: "asc" },
        },
      });

      for (const batch of sourceBatches) {
        if (remainingToDeduct <= 0) break;
        const currentBatchRemaining = batch.remainingQuantity ?? batch.quantity;
        if (currentBatchRemaining <= 0) continue;
        const deductQty = Math.min(currentBatchRemaining, remainingToDeduct);
        const newRemaining = Math.max(0, currentBatchRemaining - deductQty);

        await tx.purchaseOrderItem.update({
          where: { id: batch.id },
          data: {
            remainingQuantity: newRemaining,
          },
        });

        consumedBatches.push({
          purchaseOrderItemId: batch.id,
          quantity: deductQty,
          unitCost: Number(batch.costPrice) || sourceCost,
          totalCost: (Number(batch.costPrice) || sourceCost) * deductQty,
        });

        remainingToDeduct -= deductQty;
      }

      // 4. 查找或创建目标店铺商品
      let targetProduct = null;

      // 如果前端明确指定了目标店铺商品 ID
      if (targetShopProductId) {
        targetProduct = await tx.shopProduct.findFirst({
          where: {
            id: targetShopProductId,
            shopId: targetShopId,
          },
        });
        if (!targetProduct) {
          throw new Error("指定的目标店铺商品不存在");
        }
      }

      // 若未指定目标商品，优先通过主库 productId 匹配
      if (!targetProduct && sourceProduct.productId) {
        targetProduct = await tx.shopProduct.findFirst({
          where: {
            shopId: targetShopId,
            productId: sourceProduct.productId,
          },
        });
      }

      // 若没有通过 productId 找到，尝试通过 sourceProductId 匹配
      if (!targetProduct && sourceProduct.sourceProductId) {
        targetProduct = await tx.shopProduct.findFirst({
          where: {
            shopId: targetShopId,
            sourceProductId: sourceProduct.sourceProductId,
          },
        });
      }

      // 若仍未找到且存在有效 sku，尝试在目标店铺内按 sku 匹配同款商品
      if (!targetProduct && sourceProduct.sku) {
        targetProduct = await tx.shopProduct.findFirst({
          where: {
            shopId: targetShopId,
            sku: sourceProduct.sku,
          },
        });
      }

      // 计算本次调入的单件实际采购成本（到岸进价）
      const inboundUnitCost = explicitTargetCostPrice !== null
        ? explicitTargetCostPrice
        : Math.round((sourceCost + shippingFee) * 100) / 100;

      if (targetProduct) {
        // 目标店铺已存在该商品，增加库存并更新最新采购价格（具体出库成本由生成的入库采购批次独立管理）
        targetProduct = await tx.shopProduct.update({
          where: { id: targetProduct.id },
          data: {
            stock: { increment: quantity },
            costPrice: inboundUnitCost,
          },
        });
      } else {
        // 目标店铺尚未上架该商品，自动为目标店铺新建商品并分配库存与采购成本
        // 检查目标店铺是否已有 SKU 冲突（带递增计数防冲突）
        let safeSku = sourceProduct.sku;
        if (safeSku) {
          let candidate = safeSku;
          let counter = 1;
          while (await tx.shopProduct.findFirst({ where: { shopId: targetShopId, sku: candidate }, select: { id: true } })) {
            candidate = `${safeSku}-T${counter++}`;
          }
          safeSku = candidate;
        }

        // 检查第三方 ID 冲突
        const safeJdSkuId = sourceProduct.jdSkuId
          ? ((await tx.shopProduct.findFirst({ where: { shopId: targetShopId, jdSkuId: sourceProduct.jdSkuId }, select: { id: true } })) ? null : sourceProduct.jdSkuId)
          : null;
        const safeMeituanSkuId = sourceProduct.meituanSkuId
          ? ((await tx.shopProduct.findFirst({ where: { shopId: targetShopId, meituanSkuId: sourceProduct.meituanSkuId }, select: { id: true } })) ? null : sourceProduct.meituanSkuId)
          : null;
        const safeTaobaoSkuId = sourceProduct.taobaoSkuId
          ? ((await tx.shopProduct.findFirst({ where: { shopId: targetShopId, taobaoSkuId: sourceProduct.taobaoSkuId }, select: { id: true } })) ? null : sourceProduct.taobaoSkuId)
          : null;
        const safeDoudianSkuId = sourceProduct.doudianSkuId
          ? ((await tx.shopProduct.findFirst({ where: { shopId: targetShopId, doudianSkuId: sourceProduct.doudianSkuId }, select: { id: true } })) ? null : sourceProduct.doudianSkuId)
          : null;

        targetProduct = await tx.shopProduct.create({
          data: {
            shopId: targetShopId,
            productId: sourceProduct.productId || null,
            sourceProductId: sourceProduct.sourceProductId || sourceProduct.productId || null,
            sku: safeSku,
            jdSkuId: safeJdSkuId,
            meituanSkuId: safeMeituanSkuId,
            taobaoSkuId: safeTaobaoSkuId,
            doudianSkuId: safeDoudianSkuId,
            productName: sourceProduct.productName || "未知商品",
            pinyin: sourceProduct.pinyin,
            productImage: sourceProduct.productImage,
            categoryId: sourceProduct.categoryId,
            categoryName: sourceProduct.categoryName || "未分类",
            supplierId: sourceProduct.supplierId,
            costPrice: inboundUnitCost,
            stock: quantity,
            isPublic: sourceProduct.isPublic,
            isDiscontinued: sourceProduct.isDiscontinued,
            remark: sourceProduct.remark,
            isShelfLife: sourceProduct.isShelfLife,
            shelfLifeDays: sourceProduct.shelfLifeDays,
          },
        });
      }

      // 4. 自动为目标店铺生成调拨入库采购单（打通采购记录与入库历史）
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      const inboundOrderNo = `PO-TR-${dateStr}-${randomSuffix}`;
      const inboundTotalAmount = Math.round(inboundUnitCost * quantity * 100) / 100;
      const inboundShippingTotal = Math.round(shippingFee * quantity * 100) / 100;

      const purchaseOrder = await tx.purchaseOrder.create({
        data: {
          id: inboundOrderNo,
          type: "Inbound",
          status: "Received",
          totalAmount: inboundTotalAmount,
          shippingFees: inboundShippingTotal,
          date: new Date(),
          shopName: targetShop.name,
          shippingAddress: `门店调拨（调出方：${sourceShop.name} ➔ 调入方：${targetShop.name}）`,
          note: `跨门店调货入库 (调出自: ${sourceShop.name}${remark ? `，备注: ${remark}` : ""})`,
          userId: user.id,
          items: {
            create: [{
              productId: targetProduct.productId || sourceProduct.productId || null,
              shopProductId: targetProduct.id,
              supplierId: targetProduct.supplierId || sourceProduct.supplierId || null,
              quantity,
              remainingQuantity: quantity,
              costPrice: inboundUnitCost,
            }],
          },
        },
        include: {
          items: true,
        },
      });

      const purchaseOrderItem = purchaseOrder.items[0];

      // 5. 处理保质期/批次转移（若开启批次且源商品有批次明细）
      if (sourceProduct.isShelfLife && sourceProduct.batches.length > 0) {
        let remainingToTransfer = quantity;
        for (const batch of sourceProduct.batches) {
          if (remainingToTransfer <= 0) break;
          const transferBatchQty = Math.min(batch.remainingStock, remainingToTransfer);

          // 扣减源批次
          await tx.productBatch.update({
            where: { id: batch.id },
            data: {
              remainingStock: { decrement: transferBatchQty },
            },
          });

          // 寻找目标商品是否已有对应到期日的批次
          const targetBatch = await tx.productBatch.findFirst({
            where: {
              shopProductId: targetProduct.id,
              expirationDate: batch.expirationDate,
              ...(batch.batchNo ? { batchNo: batch.batchNo } : {}),
            },
          });

          if (targetBatch) {
            await tx.productBatch.update({
              where: { id: targetBatch.id },
              data: {
                quantity: { increment: transferBatchQty },
                remainingStock: { increment: transferBatchQty },
                ...(purchaseOrderItem?.id ? { purchaseOrderItemId: purchaseOrderItem.id } : {}),
              },
            });
          } else {
            await tx.productBatch.create({
              data: {
                productId: batch.productId,
                shopProductId: targetProduct.id,
                purchaseOrderItemId: purchaseOrderItem?.id || null,
                batchNo: batch.batchNo,
                productionDate: batch.productionDate,
                expirationDate: batch.expirationDate,
                quantity: transferBatchQty,
                remainingStock: transferBatchQty,
                userId: user.id,
                remark: `调拨入库 (源自 ${sourceShop.name})`,
              },
            });
          }

          remainingToTransfer -= transferBatchQty;
        }
      }

      // 6. 自动为源店铺生成调拨出库单（打通出库流向追溯与进销存台账）
      const outboundOrder = await tx.outboundOrder.create({
        data: {
          type: "Transfer",
          date: new Date(),
          note: `跨门店调拨出库 (从【${sourceShop.name}】调往【${targetShop.name}】${remark ? `，备注: ${remark}` : ""}) [入库单号: ${inboundOrderNo}]`,
          userId: user.id,
          items: {
            create: [{
              productId: sourceProduct.productId || null,
              shopProductId: sourceProduct.id,
              quantity,
              price: sourceCost,
              costSnapshot: {
                batches: consumedBatches,
              },
            }],
          },
        },
      });

      // 7. 记录调拨流水
      const transferRecord = await tx.shopTransferRecord.create({
        data: {
          sourceShopId,
          targetShopId,
          sourceShopProductId: sourceProduct.id,
          targetShopProductId: targetProduct.id,
          productId: sourceProduct.productId || sourceProduct.sourceProductId || null,
          productName: (targetProduct.productName && targetProduct.productName !== sourceProduct.productName)
            ? `${sourceProduct.productName} ➔ ${targetProduct.productName}`
            : (sourceProduct.productName || "未知商品"),
          sku: sourceProduct.sku || null,
          quantity,
          shippingFee,
          sourceCostPrice: sourceCost,
          targetCostPrice: inboundUnitCost,
          remark: remark
            ? `${remark} [调拨入库单: ${inboundOrderNo} | 出库单: ${outboundOrder.id}]`
            : `[调拨入库单: ${inboundOrderNo} | 出库单: ${outboundOrder.id}]`,
          userId: user.id,
        },
      });

      return {
        record: transferRecord,
        purchaseOrderId: purchaseOrder.id,
        outboundOrderId: outboundOrder.id,
        sourceStock: updatedSourceProduct.stock,
        targetStock: targetProduct.stock,
        sourceShopName: sourceShop.name,
        targetShopName: targetShop.name,
        sourceCostPrice: sourceCost,
        inboundUnitCost,
        finalTargetCostPrice: targetProduct.costPrice,
      };
    });

    return NextResponse.json({
      success: true,
      message: `成功将 ${quantity} 件商品从【${transferResult.sourceShopName}】调拨至【${transferResult.targetShopName}】`,
      data: transferResult,
    });
  } catch (error) {
    console.error("Transfer stock error:", error);
    const message = error instanceof Error ? error.message : "调拨处理失败，请重试";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
