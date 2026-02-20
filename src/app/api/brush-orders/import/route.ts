import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { SessionUser } from "@/lib/permissions";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession() as SessionUser | null;
    const workspaceId = session?.workspaceId;
    if (!session || !workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    for (const row of data) {
      try {
        // Map keys (supporting both Chinese and Optional * for required fields)
        const dateStr = row['日期'] || row['*日期'];
        const type = row['类型'] || row['*类型'];
        const principal = row['本金'] || row['*本金'];
        const payment = row['实付'] || row['*实付'];
        const received = row['到手金额'] || row['*到手金额'];
        const commission = row['佣金'] || row['*佣金'];
        const note = row['备注'] || row['*备注'];
        const productName = row['商品名称'] || row['*商品名称'];
        const sku = row['SKU'] || row['*SKU'];
        const quantity = row['数量'] || row['*数量'] || 1;

        if (!type || !dateStr) {
          results.failed++;
          results.errors.push(`第 ${results.success + results.failed} 行: 类型和日期是必填项`);
          continue;
        }

        // Try to find product in CURRENT workspace
        let product = null;
        if (sku) {
          product = await prisma.product.findFirst({ 
              where: { 
                  sku: String(sku), 
                  workspaceId 
              } 
          });
        }
        if (!product && productName) {
          product = await prisma.product.findFirst({ 
              where: { 
                  name: String(productName), 
                  workspaceId 
              } 
          });
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
            workspaceId,
            principalAmount: parseFloat(String(principal || 0)),
            paymentAmount: parseFloat(String(payment || 0)),
            receivedAmount: parseFloat(String(received || 0)),
            commission: parseFloat(String(commission || 0)),
            note: note ? String(note) : null,
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
