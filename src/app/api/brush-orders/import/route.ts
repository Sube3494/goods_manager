import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { parseAsShanghaiTime } from "@/lib/dateUtils";
import { OrderParser } from "@/lib/orderParser";
import { InventoryService } from "@/services/inventoryService";
import { ProductService } from "@/services/productService";
import { AddressItem, BrushShopItem } from "@/lib/types";
import { Prisma } from "../../../../../prisma/generated-client";

interface UserImportProfile {
  shippingAddresses?: AddressItem[] | null;
  brushShops?: BrushShopItem[] | string[] | null;
}

type MatchableProduct = {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  sourceProductId?: string | null;
  shopName?: string | null;
};

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function pickRowValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && normalizeText(value) !== "") {
      return value;
    }
  }
  return "";
}

function stripShopSuffix(name: string) {
  return name.replace(/(店|一店|二店|三店|分店|总店)$/, "");
}

function isBrushShopMatch(shopName: string, brushShopNames: string[]) {
  if (!shopName || brushShopNames.length === 0) {
    return false;
  }

  return brushShopNames.some((brushShop) => {
    if (shopName === brushShop || shopName.includes(brushShop) || brushShop.includes(shopName)) {
      return true;
    }

    const shopCoreName = stripShopSuffix(shopName);
    const brushCoreName = stripShopSuffix(brushShop);

    return (
      shopCoreName.length >= 2 &&
      brushCoreName.length >= 2 &&
      (shopCoreName.includes(brushCoreName) || brushCoreName.includes(shopCoreName))
    );
  });
}

function isSelfDeliveryCourier(courierName: unknown) {
  const normalized = normalizeText(courierName);
  if (!normalized) {
    return false;
  }

  return ["自配送", "商家自配", "商家自配送", "门店自配", "自配"].some((keyword) =>
    normalized.includes(keyword)
  );
}

function inferPlatform(platform: unknown) {
  const rawPlatform = normalizeText(platform);
  const source = rawPlatform;

  if (source.includes("美团")) {
    return "美团";
  }
  if (source.includes("淘宝") || source.includes("天猫")) {
    return "淘宝";
  }
  if (source.includes("京东")) {
    return "京东";
  }
  if (source.includes("饿了么")) {
    return "饿了么";
  }
  if (source.includes("抖音")) {
    return "抖音";
  }
  if (source.includes("快手")) {
    return "快手";
  }
  if (source.includes("拼多多") || source.includes("多多")) {
    return "拼多多";
  }

  return rawPlatform || "帮我取货";
}

async function ensureCategory(userId: string, sourceCategoryName?: string | null) {
  const name = sourceCategoryName?.trim() || "其他分类";

  let category = await prisma.category.findFirst({
    where: { userId, name },
  });

  if (!category) {
    category = await prisma.category.create({
      data: {
        userId,
        name,
      },
    });
  }

  return category;
}

async function ensureSupplier(userId: string, sourceSupplierName?: string | null) {
  const name = sourceSupplierName?.trim();
  if (!name) {
    return null;
  }

  let supplier = await prisma.supplier.findFirst({
    where: { userId, name },
  });

  if (!supplier) {
    supplier = await prisma.supplier.create({
      data: {
        userId,
        name,
        contact: "",
        phone: "",
        email: "",
        address: "",
      },
    });
  }

  return supplier;
}

async function generateAvailableSku(baseSku: string | null) {
  if (!baseSku) {
    return null;
  }

  const normalizedBase = baseSku.trim();
  if (!normalizedBase) {
    return null;
  }

  const directHit = await prisma.product.findUnique({
    where: { sku: normalizedBase },
    select: { id: true },
  });

  if (!directHit) {
    return normalizedBase;
  }

  for (let i = 1; i <= 999; i += 1) {
    const candidate = `${normalizedBase}-COPY${i}`;
    const hit = await prisma.product.findUnique({
      where: { sku: candidate },
      select: { id: true },
    });

    if (!hit) {
      return candidate;
    }
  }

  return null;
}

async function importPublicProductForUser(userId: string, sourceProductId: string): Promise<MatchableProduct | null> {
  const existingImported = await prisma.product.findFirst({
    where: {
      userId,
      sourceProductId,
    },
    select: {
      id: true,
      name: true,
      sku: true,
      stock: true,
      sourceProductId: true,
    },
  });

  if (existingImported) {
    return existingImported;
  }

  const sourceProduct = await prisma.product.findFirst({
    where: {
      id: sourceProductId,
      isPublic: true,
    },
    include: {
      category: true,
      supplier: true,
      gallery: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!sourceProduct || sourceProduct.userId === userId) {
    return null;
  }

  const [category, supplier, sku] = await Promise.all([
    ensureCategory(userId, sourceProduct.category?.name),
    ensureSupplier(userId, sourceProduct.supplier?.name),
    generateAvailableSku(sourceProduct.sku),
  ]);

  const product = await prisma.product.create({
    data: {
      name: sourceProduct.name,
      sku,
      costPrice: sourceProduct.costPrice,
      stock: 0,
      image: sourceProduct.image,
      categoryId: category.id,
      supplierId: supplier?.id || null,
      isPublic: false,
      isDiscontinued: sourceProduct.isDiscontinued,
      specs: sourceProduct.specs ?? undefined,
      pinyin: ProductService.generatePinyinSearchText(sourceProduct.name),
      remark: sourceProduct.remark,
      userId,
      sourceProductId: sourceProduct.id,
      gallery: sourceProduct.gallery.length
        ? {
            create: sourceProduct.gallery.map((item) => ({
              url: item.url,
              thumbnailUrl: item.thumbnailUrl,
              tags: item.tags,
              isPublic: item.isPublic,
              type: item.type,
              sortOrder: item.sortOrder,
              userId,
            })),
          }
        : undefined,
    },
    select: {
      id: true,
      name: true,
      sku: true,
      stock: true,
      sourceProductId: true,
    },
  });

  return product;
}

async function restoreOutboundInventory(
  tx: Prisma.TransactionClient,
  userId: string,
  items: { productId: string | null; quantity: number }[]
) {
  for (const item of items) {
    if (!item.productId) {
      continue;
    }
    let remainingToRestore = item.quantity;

    const batches = await tx.purchaseOrderItem.findMany({
      where: {
        productId: item.productId,
        purchaseOrder: {
          userId,
          status: "Received",
        },
      },
      select: {
        id: true,
        quantity: true,
        remainingQuantity: true,
      },
      orderBy: {
        purchaseOrder: {
          date: "asc",
        },
      },
    });

    for (const batch of batches) {
      if (remainingToRestore <= 0) {
        break;
      }

      const remainingQuantity = batch.remainingQuantity || 0;
      const restoreCapacity = Math.max(batch.quantity - remainingQuantity, 0);
      if (restoreCapacity <= 0) {
        continue;
      }

      const restoreQuantity = Math.min(restoreCapacity, remainingToRestore);
      await tx.purchaseOrderItem.update({
        where: { id: batch.id },
        data: {
          remainingQuantity: {
            increment: restoreQuantity,
          },
        },
      });
      remainingToRestore -= restoreQuantity;
    }

    if (remainingToRestore > 0) {
      throw new Error(`订单覆盖失败：商品 ${item.productId} 无法完整回补库存，请先检查历史库存数据`);
    }

    await tx.product.update({
      where: { id: item.productId },
      data: {
        stock: {
          increment: item.quantity,
        },
      },
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthorizedUser("brush:manage") as SessionUser | null;
    const userId = session?.id;
    if (!session || !userId) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    if (session.role !== "SUPER_ADMIN") {
      const settings = await prisma.systemSetting.findUnique({ where: { id: "system" } });
      if (settings && !settings.allowDataImport) {
        return NextResponse.json({ error: "System data import is currently disabled" }, { status: 403 });
      }
    }

    const body = await req.json();
    const data = Array.isArray(body)
      ? body
      : (body && Array.isArray(body.rows) ? body.rows : null);

    if (!Array.isArray(data)) {
      return NextResponse.json({ error: "数据格式不正确" }, { status: 400 });
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
      brushOrdersCount: 0,
      realOrdersCount: 0,
      overwrittenCount: 0,
    };
    const canImportMatchedPublicProduct =
      hasPermission(session, "product:create") &&
      hasPermission(session, "category:manage") &&
      hasPermission(session, "supplier:manage");

    // 获取用户的预设店铺列表（用于智能洗清过长的平台店名）
    const userDb = await prisma.user.findUnique({
      where: { id: userId },
      select: { shippingAddresses: true, brushShops: true }
    });

    const userProfile = userDb as UserImportProfile | null;
    const internalShops = new Set<string>();
    const brushShopNames = new Set<string>();
    if (userProfile && Array.isArray(userProfile.shippingAddresses)) {
      userProfile.shippingAddresses.forEach((a) => {
        if (a.label) internalShops.add(a.label);
      });
    }
    if (userProfile && Array.isArray(userProfile.brushShops)) {
      userProfile.brushShops.forEach((s) => {
        if (typeof s === 'string') {
          internalShops.add(s);
          brushShopNames.add(s);
        } else if (s.name) {
          internalShops.add(s.name);
          brushShopNames.add(s.name);
        }
      });
    }
    const internalShopNames = Array.from(internalShops);
    const normalizedBrushShopNames = Array.from(brushShopNames).map((name) => normalizeText(name)).filter(Boolean);

    // 取出用户门店商品用于优先匹配，回写时仍使用 sourceProductId / productId
    const shopProducts = await prisma.shopProduct.findMany({
      where: {
        shop: { userId },
      },
      include: {
        shop: { select: { name: true } },
      },
    });
    const standaloneShopProducts = shopProducts
      .map((item) => {
        const resolvedId = item.sourceProductId || item.productId;
        if (!resolvedId) {
          return null;
        }

        return {
          id: resolvedId,
          name: item.productName || "未命名商品",
          sku: item.sku,
          stock: item.stock,
          sourceProductId: resolvedId,
          shopName: item.shop.name,
        };
      });
    const allProducts: MatchableProduct[] = standaloneShopProducts.filter(
      (item): item is NonNullable<typeof item> => item !== null
    );
    const publicProducts = await prisma.product.findMany({
      where: {
        isPublic: true,
        NOT: { userId },
      },
      select: {
        id: true,
        name: true,
      },
    });

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 1;
      try {
        // 1. 标准化提取您的表格字段
        const dateStr = normalizeText(pickRowValue(row, ['下单日期', '日期', '下单时间', '*日期']));
        let platform = inferPlatform(
          pickRowValue(row, ['平台', '来源平台', '类型', '*类型'])
        );
        const courierName = normalizeText(pickRowValue(row, ['配送人员', '骑手', '配送骑手']));
        const orderStatus = normalizeText(pickRowValue(row, ['状态', '订单状态']));

        // 过滤无效订单：跳过"已删除"、"已取消"、"已退款"的订单
        if (orderStatus.includes('删除') || orderStatus.includes('取消') || orderStatus.includes('退款')) {
          results.success++; // 算入静默成功（不用报错）
          continue;
        }
        
        // --- 智能平台名称清洗 (Smart Platform Normalization) ---
        // 将各平台长长的细分业务线名称（如“美团闪购”、“淘宝闪购零售”、“京东秒送”）降维成系统基础模块
        platform = normalizeText(platform);
        if (platform.includes("美团")) {
          platform = "美团";
        } else if (platform.includes("淘宝") || platform.includes("天猫")) {
          platform = "淘宝";
        } else if (platform.includes("京东")) {
          platform = "京东";
        } else if (platform.includes("饿了么")) {
          platform = "饿了么";
        } else if (platform.includes("抖音")) {
          platform = "抖音";
        } else if (platform.includes("快手")) {
          platform = "快手";
        } else if (platform.includes("拼多多") || platform.includes("多多")) {
          platform = "拼多多";
        } else if (platform === "其它" || platform === "未知平台" || platform === "") {
          platform = "帮我取货";
        }
        
        // 财务字段
        const payment = pickRowValue(row, ['用户实付金额', '实付', '*实付', '实际支付']) || 0;
        const received = pickRowValue(row, ['商家实收金额', '到手金额', '*到手金额', '预计收入']) || 0;
        const commission = pickRowValue(row, ['佣金', '*佣金']) || 0;
        const note = normalizeText(pickRowValue(row, ['备注', '*备注']));
        const rawProductName = normalizeText(pickRowValue(row, ['商品', '商品名称', '*商品名称']));
        let shopName = normalizeText(pickRowValue(row, ['平台店铺', '店铺', '*店铺', '所属门店']));
        const shopAddress = normalizeText(pickRowValue(row, ['配送门店', '门店地址', '店铺地址', '发货地址', '收件地址', '取货地址']));
        const platformOrderId = normalizeText(pickRowValue(row, ['订单编号', '平台单号', '*平台单号', '订单号']));
        const dailySerial = normalizeText(pickRowValue(row, ['原流水号', '流水号', '日流水号', '序号']));

        if (!dateStr || !rawProductName) {
          results.failed++;
          results.errors.push(`第 ${rowNumber} 行: 缺少下单日期或商品信息`);
          continue;
        }

        const strOrderId = platformOrderId ? String(platformOrderId).trim() : "";

        // --- 智能店铺名称清洗 (Smart Shop Name Normalization) ---
        shopName = normalizeText(shopName);
        if (shopName && internalShopNames.length > 0) {
          // 1. 优先进行精确包含匹配（如 "私人订制白云店" 包含 "白云店"）
          let matchedInternalShop = internalShopNames.find(internal => shopName.includes(internal));

          // 2. 如果没匹配上，进行核心词模糊降级匹配
          // 解决痛点：系统设置的是 "遵义店"，但表格里写的是 "遵义一店"，直接 includes 匹配不上
          if (!matchedInternalShop) {
            matchedInternalShop = internalShopNames.find(internal => {
              // 剥离掉内部店名末尾常见的 "店"、"一店" 等字眼，提取出核心地名（如 "遵义"）
              const coreName = internal.replace(/(店|一店|二店|分店|总店)$/, '');
              // 核心地名必须大于等于2个字以防误杀（比如 "A店" 变成 "A"），并且 Excel 表格里包含了该核心地名
              return coreName.length >= 2 && shopName.includes(coreName);
            });
          }

          // 3. 如果还是没匹配上（比如“私人定制优选礼品”、“帮我取货”这种不包含地名的），
          // 我们通过 Excel 表里可能存在的“地址”列，结合系统配置的真实物理地址来进行逆向推导
          if (!matchedInternalShop && shopAddress && userProfile && Array.isArray(userProfile.shippingAddresses)) {
            const shopAddrStr = String(shopAddress).trim();
            // 优先：用系统存储的物理地址与配送门店做互向子串匹配
            // 例: 配送门店="粤顺商务中心4楼423", 系统地址="...粤顺商务中心4楼423..." → 匹配白云店
            const foundByAddress = shopAddrStr ? userProfile.shippingAddresses.find((addr) => {
              const sysAddress = String(addr.address || "").trim();
              if (!sysAddress) return false;
              return sysAddress.includes(shopAddrStr) || shopAddrStr.includes(sysAddress);
            }) : null;

            if (foundByAddress) {
              matchedInternalShop = foundByAddress.label;
            } else if (shopAddrStr) {
              // 降级：用 label 核心地名匹配配送门店
              const fallback = userProfile.shippingAddresses.find((addr) => {
                const label = addr.label || "";
                const coreLocation = label.replace(/(店|一店|二店|分店|总店)$/, '');
                return coreLocation.length >= 2 && shopAddrStr.includes(coreLocation);
              });
              if (fallback) {
                matchedInternalShop = fallback.label;
              }
            }
          }

          // 如果找到了内部的店铺映射，直接将其替换为最简短干净的内部店名
          if (matchedInternalShop) {
            shopName = matchedInternalShop;
          }
        }

        // 2. 智能订单分流器
        // 根据您的业务逻辑修正：严格判定“自配送”才是刷单，或者人为备注了刷单才走刷单通道。
        // 空白的配送平台（或“其它”平台）都属于真实的取货/销售，必须走真实出库通道扣减库存！
        const normalizedNote = normalizeText(note);
        const isBrushOrder =
          isSelfDeliveryCourier(courierName) ||
          normalizedNote.includes("刷单") ||
          isBrushShopMatch(shopName, normalizedBrushShopNames);

        // 3. 多商品智能解析器 (处理类似 "xxx*1 + yyy*2")
        const parsedItems = OrderParser.parseProductString(rawProductName);
        if (parsedItems.length === 0) {
          results.failed++;
          results.errors.push(`第 ${rowNumber} 行: 无法识别商品名称和数量`);
          continue;
        }

        // 匹配商品库
        const matchedItems: { productId: string, quantity: number }[] = [];
        let matchFailed = false;
        for (const item of parsedItems) {
          const shopScopedProducts = shopName
            ? allProducts.filter((product) => product.shopName === shopName)
            : allProducts;
          let product = OrderParser.findBestMatchProduct(
            item.rawName,
            shopScopedProducts.length > 0 ? shopScopedProducts : allProducts
          );

          if (!product && canImportMatchedPublicProduct) {
            const publicProduct = OrderParser.findBestMatchProduct(item.rawName, publicProducts);
            if (publicProduct) {
              const importedProduct = await importPublicProductForUser(userId, publicProduct.id);
              if (importedProduct) {
                allProducts.push(importedProduct);
                product = importedProduct;
              }
            }
          }

          if (!product) {
            results.failed++;
            results.errors.push(`第 ${rowNumber} 行: 找不到匹配的商品 "${item.rawName}"`);
            matchFailed = true;
            break;
          }
          matchedItems.push({
            productId: product.id,
            quantity: item.quantity,
          });
        }

        if (matchFailed) continue;

        let existingBrush: { id: string; items: { productId: string; quantity: number }[] } | null = null;
        let existingOutbound: { id: string; items: { productId: string | null; quantity: number }[] } | null = null;

        if (strOrderId) {
          existingBrush = await prisma.brushOrder.findFirst({
            where: { userId, platformOrderId: strOrderId },
            select: {
              id: true,
              items: {
                select: {
                  productId: true,
                  quantity: true,
                },
              },
            },
          });

          existingOutbound = await prisma.outboundOrder.findFirst({
            where: {
              userId,
              note: { contains: `平台单号: ${strOrderId}` },
            },
            select: {
              id: true,
              items: {
                select: {
                  productId: true,
                  quantity: true,
                },
              },
            },
          });
        }

        // 4. 执行业务逻辑分支
        if (isBrushOrder) {
          // ==============================
          // 分支 A: 刷单（不扣库存，记入 BrushOrder）
          // ==============================
          const typeTag = "[刷单]";
          const finalNote = note ? `${typeTag} ${note}` : typeTag;

          await prisma.$transaction(async (tx) => {
            if (existingOutbound) {
              await restoreOutboundInventory(tx, userId, existingOutbound.items);
              await tx.outboundOrder.delete({
                where: { id: existingOutbound.id },
              });
            }

            if (existingBrush) {
              await tx.brushOrder.delete({
                where: { id: existingBrush.id },
              });
            }

            await tx.brushOrder.create({
              data: {
                date: parseAsShanghaiTime(dateStr),
                type: String(platform),
                status: "Completed",
                userId,
                paymentAmount: parseFloat(String(payment)),
                receivedAmount: parseFloat(String(received)),
                commission: parseFloat(String(commission)),
                note: finalNote,
                shopName: shopName ? String(shopName) : null,
                platformOrderId: strOrderId || null,
                items: {
                  create: matchedItems.map(item => ({
                    productId: item.productId,
                    quantity: item.quantity
                  }))
                }
              }
            });
          });

          if (existingBrush || existingOutbound) {
            results.overwrittenCount++;
          }
          results.brushOrdersCount++;
          results.success++;

        } else {
          // ==============================
          // 分支 B: 真实订单（必须扣减真实库存 + 自动补满 0 库存）
          // ==============================
          
          await prisma.$transaction(async (tx) => {
            if (existingBrush) {
              await tx.brushOrder.delete({
                where: { id: existingBrush.id },
              });
            }

            if (existingOutbound) {
              await restoreOutboundInventory(tx, userId, existingOutbound.items);
              await tx.outboundOrder.delete({
                where: { id: existingOutbound.id },
              });
            }

            // 4.1 自动库存补偿逻辑 (Auto-Inbound Compensator)
            // 在扣减之前，检查每个商品的当前库存是否足够。如果不足，立刻打单入库。
            for (const item of matchedItems) {
              const currentProduct = await tx.product.findUnique({
                where: { id: item.productId },
                select: { stock: true }
              });

              const currentStock = currentProduct?.stock || 0;
              if (currentStock < item.quantity) {
                // 库存不足以发货！系统自动生成虚拟入库单，补齐差额
                const gap = item.quantity - currentStock;
                const compensateOrderId = `PO-AUTO-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
                
                await tx.purchaseOrder.create({
                  data: {
                    id: compensateOrderId,
                    type: "Inbound",
                    status: "Received", // 直接完成
                    totalAmount: 0,
                    date: new Date(),
                    note: `[${platform}导入] [流水号:${dailySerial || '无'}] 导入订单(单号:${platformOrderId})时库存不足，系统自动补齐 ${gap} 件`,
                    shopName: shopName ? String(shopName) : null, // 传递清洗后的智能店名
                    userId: userId,
                    items: {
                      create: [{
                        productId: item.productId,
                        quantity: gap,
                        remainingQuantity: gap,
                        costPrice: 0
                      }]
                    }
                  }
                });

                // 更新商品总表库存，将其拉平到发货要求线
                await tx.product.update({
                  where: { id: item.productId },
                  data: { stock: { increment: gap } }
                });
              }
            }

            // 4.2 创建真实的出库单 (OutboundOrder)
            const outboundNote = shopName 
                ? `[店铺:${shopName}] [流水号:${dailySerial || '无'}] [${platform}导入] 平台单号: ${platformOrderId} ${note ? ' | 备注: ' + note : ''}`
                : `[流水号:${dailySerial || '无'}] [${platform}导入] 平台单号: ${platformOrderId} ${note ? ' | 备注: ' + note : ''}`;

            await tx.outboundOrder.create({
              data: {
                type: "Sale",
                date: parseAsShanghaiTime(dateStr),
                status: "Normal",
                userId,
                note: outboundNote,
                items: {
                  create: matchedItems.map(item => ({
                    productId: item.productId,
                    quantity: item.quantity,
                    price: parseFloat(String(payment)) / matchedItems.length // 简单均摊价格
                  }))
                }
              }
            });

            // 4.3 调用带并发安全锁的 FIFO 出库扣减服务
            await InventoryService.processOutboundFIFO(tx, userId, matchedItems.map(i => ({
              productId: i.productId,
              quantity: i.quantity
            })));
          });

          if (existingBrush || existingOutbound) {
            results.overwrittenCount++;
          }
          results.realOrdersCount++;
          results.success++;
        }
      } catch (err) {
        console.error(`Import row error (Row ${rowNumber}):`, err);
        results.failed++;
        results.errors.push(`第 ${rowNumber} 行: 系统处理错误 - ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("Orders Unified Import Error:", error);
    return NextResponse.json(
      { error: "导入失败: " + (error instanceof Error ? error.message : "未知错误") },
      { status: 500 }
    );
  }
}
