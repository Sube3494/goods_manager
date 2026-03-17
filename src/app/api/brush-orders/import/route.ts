import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { SessionUser } from "@/lib/permissions";

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
      errors: [] as string[]
    };

    // Process in a transaction or individually? 
    // Individually might be better for reporting specific row errors, 
    // but a transaction ensures consistency. 
    // Given it's an import, let's try to do as much as possible.

    const allProducts = await prisma.product.findMany({
      where: { userId },
      select: { id: true, name: true, sku: true }
    });

    for (const row of data) {
      try {
        // Map keys (supporting both Chinese and Optional * for required fields)
        // Standard headers
        const dateStr = row['日期'] || row['*日期'] || row['下单时间'];
        let type = row['类型'] || row['*类型'];
        const payment = row['实付'] || row['*实付'] || row['实际支付'];
        const received = row['到手金额'] || row['*到手金额'] || row['预计收入'];
        const commission = row['佣金'] || row['*佣金'] || 0;
        let note = row['备注'] || row['*备注'] || "";
        const productName = row['商品名称'] || row['*商品名称'];
        const sku = row['SKU'] || row['*SKU'];
        const quantity = row['数量'] || row['*数量'] || 1;
        const shopName = row['店铺'] || row['*店铺'] || row['所属门店'];
        const platformOrderId = row['平台单号'] || row['*平台单号'] || row['订单号'];
        const deliveryMethod = row['配送方式'];

        // Recognition logic for Meituan Flash Sale
        if (!type && deliveryMethod) {
          type = "美团";
        }

        // FILTER: Only import brush orders (自配送)
        // If it's a Meituan report (has deliveryMethod) and it's not "自配送", skip it.
        if (deliveryMethod && deliveryMethod !== "自配送") {
          continue; 
        }

        if (deliveryMethod === "自配送") {
          const typeTag = "[刷单]";
          note = note ? `${typeTag} ${note}` : typeTag;
        }

        if (!type || !dateStr) {
          results.failed++;
          results.errors.push(`第 ${results.success + results.failed} 行: 类型和日期是必填项`);
          continue;
        }

        // --- Smart Product Matching Logic ---
        let product = null;
        const targetSku = sku ? String(sku).trim() : null;
        const targetName = productName ? String(productName).trim() : null;

        // 1. Try SKU exact match
        if (targetSku) {
            product = allProducts.find(p => p.sku === targetSku);
        }

        // 2. Try Name exact match
        if (!product && targetName) {
            product = allProducts.find(p => p.name === targetName);
        }

        // 3. Smart Token & Bi-gram Scoring Match
        if (!product && targetName) {
            // Clean marketing characters
            const cleanTarget = targetName.replace(/[【】\[\]()（）\s]/g, ' ');
            
            // Tokenize English/Numbers
            const targetKeywords = cleanTarget.split(/([a-zA-Z0-9.\-_]{2,})/).filter(k => k && k.trim().length >= 2);
            
            // Create Bi-grams for Chinese parts
            const biGrams: string[] = [];
            for (let i = 0; i < targetName.length - 1; i++) {
                const chunk = targetName.substring(i, i + 2);
                if (/[\u4e00-\u9fa5]{2}/.test(chunk)) {
                    biGrams.push(chunk);
                }
            }
            
            let bestScore = 0;
            let bestMatch = null;

            for (const p of allProducts) {
                let score = 0;
                const pName = p.name;

                // Full include score (highest weight)
                if (targetName.includes(pName) || pName.includes(targetName)) {
                    score += 20;
                }

                // Keyword hits (English/Code)
                targetKeywords.forEach(kw => {
                    if (pName.toLowerCase().includes(kw.toLowerCase())) {
                        score += kw.length * 2;
                    }
                });

                // Bi-gram hits (Chinese)
                biGrams.forEach(bg => {
                    if (pName.includes(bg)) {
                        score += 1;
                    }
                });

                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = p;
                }
            }

            // Threshold: must have a decent level of overlap
            if (bestScore >= 5) {
                product = bestMatch;
            }
        }

        if (!product) {
          results.failed++;
          results.errors.push(`第 ${results.success + results.failed} 行: 找不到匹配的商品 (${productName || sku})`);
          continue;
        }

        await prisma.brushOrder.create({
          data: {
            date: new Date(dateStr),
            type: String(type),
            status: "Completed", // Default to completed for imports
            userId,
            paymentAmount: parseFloat(String(payment || 0)),
            receivedAmount: parseFloat(String(received || 0)),
            commission: parseFloat(String(commission || 0)),
            note: note ? String(note) : null,
            shopName: shopName ? String(shopName) : null,
            platformOrderId: platformOrderId ? String(platformOrderId) : null,
            items: {
              create: [
                {
                  productId: product.id,
                  quantity: parseInt(String(quantity))
                }
              ]
            }
          }
        });

        results.success++;
      } catch (err) {
        console.error("Import row error:", err);
        results.failed++;
        results.errors.push(`第 ${results.success + results.failed} 行: 系统处理错误`);
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("Brush Order Import Error:", error);
    return NextResponse.json(
      { error: "导入失败: " + (error instanceof Error ? error.message : "未知错误") },
      { status: 500 }
    );
  }
}
