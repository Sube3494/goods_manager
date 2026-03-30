import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { SessionUser } from "@/lib/permissions";
import { parseAsShanghaiTime } from "@/lib/dateUtils";
import { OrderParser } from "@/lib/orderParser";
import { InventoryService } from "@/services/inventoryService";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession() as SessionUser | null;
    const userId = session?.id;
    if (!session || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.role !== "SUPER_ADMIN") {
      const settings = await prisma.systemSetting.findUnique({ where: { id: "system" } });
      if (settings && !settings.allowDataImport) {
        return NextResponse.json({ error: "System data import is currently disabled" }, { status: 403 });
      }
    }

    const data = await req.json();
    if (!Array.isArray(data)) {
      return NextResponse.json({ error: "数据格式不正确" }, { status: 400 });
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
      brushOrdersCount: 0,
      realOrdersCount: 0
    };

    // 获取用户的预设店铺列表（用于智能洗清过长的平台店名）
    const userDb = await prisma.user.findUnique({
      where: { id: userId },
      select: { shippingAddresses: true, brushShops: true }
    });

    const internalShops = new Set<string>();
    if (Array.isArray(userDb?.shippingAddresses)) {
      userDb.shippingAddresses.forEach((a: any) => {
        if (a.label) internalShops.add(a.label);
      });
    }
    if (Array.isArray(userDb?.brushShops)) {
      userDb.brushShops.forEach((s: any) => {
        if (typeof s === 'string') internalShops.add(s);
        else if (s.name) internalShops.add(s.name);
      });
    }
    const internalShopNames = Array.from(internalShops);

    // 取出用户所有的商品用于智能名称匹配
    const allProducts = await prisma.product.findMany({
      where: { userId },
      select: { id: true, name: true, sku: true, stock: true } // 需要库存用于智能补偿
    });

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 1;
      try {
        // 1. 标准化提取您的表格字段
        const dateStr = row['下单日期'] || row['日期'] || row['下单时间'] || row['*日期'];
        let platform = row['来源平台'] || row['类型'] || row['*类型'] || "未知平台";
        const deliveryMethod = row['配送平台'] || row['配送方式'];
        
        // --- 智能平台名称清洗 (Smart Platform Normalization) ---
        // 将各平台长长的细分业务线名称（如“美团闪购”、“淘宝闪购零售”、“京东秒送”）降维成系统基础模块
        platform = String(platform).trim();
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
        } else if (platform === "其它" || platform === "") {
          platform = "其它";
        }
        
        // 财务字段
        const payment = row['用户实付金额'] || row['实付'] || row['*实付'] || row['实际支付'] || 0;
        const received = row['商家实收金额'] || row['到手金额'] || row['*到手金额'] || row['预计收入'] || 0;
        const commission = row['佣金'] || row['*佣金'] || 0;
        const shippingFee = row['配送费'] || 0;
        
        let note = row['备注'] || row['*备注'] || "";
        const rawProductName = row['商品'] || row['商品名称'] || row['*商品名称'];
        let shopName = row['平台店铺'] || row['店铺'] || row['*店铺'] || row['所属门店'] || "";
        const shopAddress = row['门店地址'] || row['店铺地址'] || row['发货地址'] || row['地址'] || row['收件地址'] || row['取货地址'] || "";
        const platformOrderId = row['订单编号'] || row['平台单号'] || row['*平台单号'] || row['订单号'];
        const dailySerial = row['流水号'] || row['日流水号'] || "";

        if (!dateStr || !rawProductName) {
          results.failed++;
          results.errors.push(`第 ${rowNumber} 行: 缺少下单日期或商品信息`);
          continue;
        }

        // --- 幂等性校验 (防重防漏机制) ---
        // 如果表格中存在订单号，检查数据库中是否已经导入过该订单，防止多次点击导致库存和财务数据翻倍
        if (platformOrderId) {
          const strOrderId = String(platformOrderId);
          
          // 检查是否已存在于刷单表
          const existingBrush = await prisma.brushOrder.findFirst({
            where: { userId, platformOrderId: strOrderId }
          });
          
          // 检查是否已存在于出库表 (通过我们在 note 中打的特征 tag 进行精确匹配)
          const existingOutbound = await prisma.outboundOrder.findFirst({
            where: { 
              userId, 
              note: { contains: `平台单号: ${strOrderId}` } 
            }
          });

          if (existingBrush || existingOutbound) {
            results.failed++;
            results.errors.push(`第 ${rowNumber} 行: 订单号 [${strOrderId}] 已存在，系统已自动跳过防重`);
            continue;
          }
        }

        // --- 智能店铺名称清洗 (Smart Shop Name Normalization) ---
        shopName = String(shopName).trim();
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
          if (!matchedInternalShop && shopAddress && Array.isArray(userDb?.shippingAddresses)) {
            const foundByAddress = userDb.shippingAddresses.find((addr: any) => {
              // 从系统配置的地址里提取省/市/区等核心地理信息
              // 例如 "广东省广州市白云区" -> 提取 "白云" 作为一个强特征
              const addressStr = addr.address || "";
              const label = addr.label || "";
              const coreLocation = label.replace(/(店|一店|二店|分店|总店)$/, '');
              // 如果 Excel 表里的地址包含了系统核心地名，就认为属于这个店
              return coreLocation.length >= 2 && String(shopAddress).includes(coreLocation);
            });
            
            if (foundByAddress) {
              matchedInternalShop = (foundByAddress as any).label;
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
        const isBrushOrder = 
          deliveryMethod === "自配送" || 
          note.includes("刷单");

        // 3. 多商品智能解析器 (处理类似 "xxx*1 + yyy*2")
        const parsedItems = OrderParser.parseProductString(rawProductName);
        if (parsedItems.length === 0) {
          results.failed++;
          results.errors.push(`第 ${rowNumber} 行: 无法识别商品名称和数量`);
          continue;
        }

        // 匹配商品库
        const matchedItems: { productId: string, quantity: number, matchedProduct: any }[] = [];
        let matchFailed = false;
        for (const item of parsedItems) {
          const product = OrderParser.findBestMatchProduct(item.rawName, allProducts);
          if (!product) {
            results.failed++;
            results.errors.push(`第 ${rowNumber} 行: 找不到匹配的商品 "${item.rawName}"`);
            matchFailed = true;
            break;
          }
          matchedItems.push({
            productId: product.id,
            quantity: item.quantity,
            matchedProduct: product
          });
        }

        if (matchFailed) continue;

        // 4. 执行业务逻辑分支
        if (isBrushOrder) {
          // ==============================
          // 分支 A: 刷单（不扣库存，记入 BrushOrder）
          // ==============================
          const typeTag = "[刷单]";
          const finalNote = note ? `${typeTag} ${note}` : typeTag;

          await prisma.brushOrder.create({
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
              platformOrderId: platformOrderId ? String(platformOrderId) : null,
              items: {
                create: matchedItems.map(item => ({
                  productId: item.productId,
                  quantity: item.quantity
                }))
              }
            }
          });
          results.brushOrdersCount++;
          results.success++;

        } else {
          // ==============================
          // 分支 B: 真实订单（必须扣减真实库存 + 自动补满 0 库存）
          // ==============================
          
          await prisma.$transaction(async (tx) => {
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
                    note: `[流水号:${dailySerial || '无'}] 导入订单(单号:${platformOrderId})时库存不足，系统自动补齐 ${gap} 件`,
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

            const outboundOrder = await tx.outboundOrder.create({
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
