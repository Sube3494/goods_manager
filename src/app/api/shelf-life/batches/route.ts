import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { addDays, parseISO, startOfDay } from "date-fns";
import { getStorageStrategy } from "@/lib/storage";
import { InventoryService } from "@/services/inventoryService";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthorizedUser("shelf_life:read");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    }

    const storage = await getStorageStrategy();

    const search = request.nextUrl.searchParams.get("search") || "";
    const status = request.nextUrl.searchParams.get("status") || "all"; // all, expired, critical, warning, safe
    const shopId = request.nextUrl.searchParams.get("shopId") || "all";
    const page = Math.max(1, parseInt(request.nextUrl.searchParams.get("page") || "1", 10));
    const pageSize = Math.min(parseInt(request.nextUrl.searchParams.get("pageSize") || "20", 10), 100);
    const skip = (page - 1) * pageSize;

    const now = new Date();
    const today = startOfDay(now);
    const criticalThreshold = addDays(today, 15);
    const warningThreshold = addDays(today, 45);

    // 构建查询条件
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {
      remainingStock: { gt: 0 },
      product: {
        userId: user.id
      },
      shopProduct: {
        shop: {
          addressBookId: { not: null }
        }
      }
    };

    if (shopId !== "all") {
      where.shopProduct = {
        shopId,
        shop: {
          addressBookId: { not: null }
        }
      };
    }

    if (search) {
      where.OR = [
        { product: { name: { contains: search, mode: "insensitive" } } },
        { product: { pinyin: { contains: search.toLowerCase(), mode: "insensitive" } } },
        { shopProduct: { productName: { contains: search, mode: "insensitive" } } },
        { shopProduct: { sku: { contains: search, mode: "insensitive" } } }
      ];
    }

    // 根据过期状态过滤
    if (status === "expired") {
      // 已过期
      where.expirationDate = { lt: today };
    } else if (status === "critical") {
      // 严重临期 (< 15天)
      where.expirationDate = {
        gte: today,
        lt: criticalThreshold
      };
    } else if (status === "warning") {
      // 临期提醒 (15-45天)
      where.expirationDate = {
        gte: criticalThreshold,
        lt: warningThreshold
      };
    } else if (status === "safe") {
      // 安全期 (> 45天)
      where.expirationDate = {
        gte: warningThreshold
      };
    }

    const [batches, total] = await Promise.all([
      prisma.productBatch.findMany({
        where,
        include: {
          product: {
            select: {
              name: true,
              image: true,
              sku: true
            }
          },
          shopProduct: {
            select: {
              productName: true,
              sku: true,
              isShelfLife: true,
              shelfLifeDays: true,
              productImage: true,
              shop: {
                select: {
                  name: true
                }
              }
            }
          },
          purchaseOrderItem: {
            select: {
              purchaseOrder: {
                select: {
                  id: true,
                  createdAt: true
                }
              }
            }
          }
        },
        orderBy: {
          expirationDate: "asc" // 最早过期的排在最前面
        },
        skip,
        take: pageSize
      }),
      prisma.productBatch.count({ where })
    ]);

    // 计算额外的字段，如剩余过期天数等
    const resolvedBatches = batches.map(batch => {
      const expDate = startOfDay(new Date(batch.expirationDate));
      const diffTime = expDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let batchStatus = "safe";
      if (diffDays < 0) {
        batchStatus = "expired";
      } else if (diffDays <= 15) {
        batchStatus = "critical";
      } else if (diffDays <= 45) {
        batchStatus = "warning";
      }

      const rawImage = batch.product?.image || batch.shopProduct?.productImage || null;
      const productImage = rawImage ? storage.resolveUrl(rawImage) : null;

      return {
        id: batch.id,
        productId: batch.productId,
        shopProductId: batch.shopProductId,
        batchNo: batch.batchNo || "无批次号",
        productionDate: batch.productionDate ? batch.productionDate.toISOString().split("T")[0] : null,
        expirationDate: batch.expirationDate.toISOString().split("T")[0],
        quantity: batch.quantity,
        remainingStock: batch.remainingStock,
        purchaseOrderItemId: batch.purchaseOrderItemId,
        purchaseOrderId: batch.purchaseOrderItem?.purchaseOrder?.id || null,
        purchaseOrderDate: batch.purchaseOrderItem?.purchaseOrder?.createdAt || null,
        productName: batch.shopProduct?.productName || batch.product?.name || "未命名商品",
        productImage,
        sku: batch.shopProductId ? (batch.shopProduct?.sku || null) : (batch.product?.sku || null),
        shopName: batch.shopProduct?.shop?.name || "未知店铺",
        shelfLifeDays: batch.shopProduct?.shelfLifeDays || null,
        remainingDays: diffDays,
        status: batchStatus,
        remark: batch.remark || ""
      };
    });

    return NextResponse.json({
      items: resolvedBatches,
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total
    });
  } catch (error) {
    console.error("Failed to fetch product batches:", error);
    return NextResponse.json({ error: "Failed to fetch product batches" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthorizedUser("shelf_life:manage");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    }

    const body = await request.json();
    const purchaseOrderItemId = body?.purchaseOrderItemId ? String(body.purchaseOrderItemId).trim() : null;
    const productionDateStr = body?.productionDate ? String(body.productionDate).trim() : "";
    const remark = body?.remark ? String(body.remark).trim() : "";

    if (!productionDateStr) {
      return NextResponse.json({ error: "生产日期不能为空" }, { status: 400 });
    }

    const productionDate = parseISO(productionDateStr);
    
    // 如果有关联的历史到货项
    if (purchaseOrderItemId) {
      const orderItem = await prisma.purchaseOrderItem.findUnique({
        where: { id: purchaseOrderItemId },
        include: {
          shopProduct: true,
          purchaseOrder: true
        }
      });

      if (!orderItem) {
        return NextResponse.json({ error: "找不到指定的到货记录" }, { status: 404 });
      }

      if (!orderItem.shopProduct) {
        return NextResponse.json({ error: "该到货记录未关联店铺商品" }, { status: 400 });
      }

      if (!orderItem.shopProduct.isShelfLife || !orderItem.shopProduct.shelfLifeDays) {
        return NextResponse.json({ error: "该商品未启用保质期管理" }, { status: 400 });
      }

      const shelfLifeDays = orderItem.shopProduct.shelfLifeDays;
      const expirationDate = addDays(productionDate, shelfLifeDays);

      // 检查该采购明细是否已经录入过保质期
      const existingBatch = await prisma.productBatch.findFirst({
        where: { purchaseOrderItemId }
      });

      let savedBatch;
      if (existingBatch) {
        // 更新现有批次
        savedBatch = await prisma.productBatch.update({
          where: { id: existingBatch.id },
          data: {
            productionDate,
            expirationDate,
            remark,
            remainingStock: orderItem.remainingQuantity !== null ? orderItem.remainingQuantity : orderItem.quantity
          }
        });
      } else {
        // 创建新批次
        savedBatch = await prisma.productBatch.create({
          data: {
            productId: orderItem.productId || "",
            shopProductId: orderItem.shopProductId,
            batchNo: orderItem.purchaseOrder.id, // 默认以完整采购单ID作为批次号
            productionDate,
            expirationDate,
            quantity: orderItem.quantity,
            remainingStock: orderItem.remainingQuantity !== null ? orderItem.remainingQuantity : orderItem.quantity,
            purchaseOrderItemId,
            remark,
            userId: user.id
          }
        });
      }

      return NextResponse.json({
        success: true,
        batch: savedBatch
      });
    }

    // 如果是直接手动创建/补录批次（兼容历史和初始化）
    const productId = body?.productId ? String(body.productId).trim() : "";
    const shopProductId = body?.shopProductId ? String(body.shopProductId).trim() : "";
    const quantity = parseInt(body?.quantity || "0", 10);

    if (!productId || !shopProductId || quantity <= 0) {
      return NextResponse.json({ error: "缺少必要的商品参数或数量不合法" }, { status: 400 });
    }

    const shopProduct = await prisma.shopProduct.findUnique({
      where: { id: shopProductId }
    });

    if (!shopProduct || !shopProduct.isShelfLife || !shopProduct.shelfLifeDays) {
      return NextResponse.json({ error: "该商品未启用保质期管理" }, { status: 400 });
    }

    const expirationDate = addDays(productionDate, shopProduct.shelfLifeDays);

    const savedBatch = await prisma.productBatch.create({
      data: {
        productId,
        shopProductId,
        batchNo: `INIT-${new Date().toISOString().split("T")[0].replace(/-/g, "")}`,
        productionDate,
        expirationDate,
        quantity,
        remainingStock: quantity,
        remark,
        userId: user.id
      }
    });

    return NextResponse.json({
      success: true,
      batch: savedBatch
    });

  } catch (error) {
    console.error("Failed to save product batch:", error);
    return NextResponse.json({ error: "Failed to save product batch" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthorizedUser("shelf_life:manage");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    }

    const body = await request.json();
    const batchId = body?.id ? String(body.id).trim() : "";
    const remainingStock = body?.remainingStock !== undefined ? parseInt(body.remainingStock, 10) : null;
    const remark = body?.remark !== undefined ? String(body.remark).trim() : null;

    if (!batchId) {
      return NextResponse.json({ error: "缺少批次ID" }, { status: 400 });
    }

    // 用事务处理原子性更新，确保多表库存一致性
    const updatedBatch = await prisma.$transaction(async (tx) => {
      const oldBatch = await tx.productBatch.findFirst({
        where: {
          id: batchId,
          product: {
            userId: user.id
          }
        }
      });

      if (!oldBatch) {
        throw new Error("找不到指定的批次记录");
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: Record<string, any> = {};
      let diff = 0;
      if (remainingStock !== null && !isNaN(remainingStock) && remainingStock >= 0) {
        data.remainingStock = remainingStock;
        diff = remainingStock - oldBatch.remainingStock;
      }
      if (remark !== null) {
        data.remark = remark;
      }

      const updated = await tx.productBatch.update({
        where: { id: batchId },
        data
      });

      // 如果余量发生了变化，同步更新关联表的库存总量
      if (diff !== 0) {
        // 1. 同步更新采购单项的余量 (PurchaseOrderItem)
        if (oldBatch.purchaseOrderItemId) {
          const poi = await tx.purchaseOrderItem.findUnique({
            where: { id: oldBatch.purchaseOrderItemId }
          });
          if (poi) {
            const currentRemaining = poi.remainingQuantity !== null ? poi.remainingQuantity : poi.quantity;
            await tx.purchaseOrderItem.update({
              where: { id: oldBatch.purchaseOrderItemId },
              data: {
                remainingQuantity: Math.max(0, currentRemaining + diff)
              }
            });
          }
        }

        // 2. 统一同步更新主库/店铺商品总库存
        await InventoryService.syncStockFromBatches(tx, oldBatch.productId || null, oldBatch.shopProductId || null);
      }

      return updated;
    });

    return NextResponse.json({
      success: true,
      batch: updatedBatch
    });
  } catch (error) {
    console.error("Failed to update product batch:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "更新批次失败" 
    }, { status: 500 });
  }
}

