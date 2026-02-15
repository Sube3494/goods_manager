import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { SessionUser } from "@/lib/permissions";

export async function POST(request: Request) {
  try {
    const session = await getSession() as SessionUser | null;
    const workspaceId = session?.workspaceId;
    if (!session || !workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { products } = await request.json();

    // Check system setting for data import
    const settings = await prisma.systemSetting.findUnique({
        where: { id: "system" }
    });

    if (settings && !settings.allowDataImport) {
        return NextResponse.json({ error: "系统已关闭数据导入功能" }, { status: 403 });
    }    if (!Array.isArray(products) || products.length === 0) {
        return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }

    let successCount = 0;
    let failCount = 0;
    const errors: { sku: string; reason: string }[] = [];

    const importedItems: { productId: string, quantity: number, costPrice: number }[] = [];

    for (const item of products) {
        try {
            // Map keys for SKU and Quantity
            const sku = String(item.sku || item['SKU'] || item['编码'] || item['*SKU'] || "");
            const quantity = Number(item['入库数量'] || item['*入库数量'] || item.stock || item['数量'] || item['Quantity'] || 0);
            const costPrice = Number(item['进货单价'] || item['*进货单价'] || item['成本价'] || item['*成本价'] || item['成本价格'] || item.costPrice || item['Cost Price'] || 0);
            
            if (!sku) {
                failCount++;
                errors.push({ sku: "未知", reason: "未填写 SKU" });
                continue;
            }

            if (quantity <= 0) {
                failCount++;
                errors.push({ sku, reason: `入库数量无效 (${quantity})` });
                continue;
            }

            // Find existing product by SKU in CURRENT workspace
            const existingProduct = await prisma.product.findUnique({
                where: { 
                    sku_workspaceId: {
                        sku,
                        workspaceId
                    }
                }
            });

            if (existingProduct) {
                // Simplified flow: Update existing product stock
                
                const currentStock = existingProduct.stock;
                const currentCost = existingProduct.costPrice || 0;
                
                let newCostPrice = currentCost;
                
                // Calculate Weighted Average Cost
                if (costPrice > 0) {
                    if (currentStock <= 0) {
                        // If current stock is 0 or negative, reset cost to incoming price
                        newCostPrice = costPrice;
                    } else {
                        // Weighted Average Formula
                        // ((Current Stock * Current Cost) + (Incoming Qty * Incoming Cost)) / (Current Stock + Incoming Qty)
                        const totalValue = (currentStock * currentCost) + (quantity * costPrice);
                        const totalQty = currentStock + quantity;
                        newCostPrice = totalValue / totalQty;
                    }
                }

                const updateData = {
                    stock: { increment: quantity },
                    costPrice: newCostPrice
                } as Parameters<typeof prisma.product.update>[0]['data'];

                await prisma.product.update({
                    where: { id: existingProduct.id },
                    data: updateData
                });

                importedItems.push({
                    productId: existingProduct.id,
                    quantity: quantity,
                    costPrice: costPrice
                });

                successCount++;
            } else {
                // If SKU doesn't exist, we can't replenish
                console.warn(`Import: SKU ${sku} not found. Skipping.`);
                failCount++;
                errors.push({ sku, reason: "系统内未找到该 SKU" });
            }
        } catch (e) {
            console.error("Import item error:", e);
            failCount++;
            errors.push({ sku: item.sku || "未知", reason: "数据解析或数据库更新失败" });
        }
    }

    // 如果有带库存导入的商品，生成一张批量入库单
    if (importedItems.length > 0) {
        const orderId = `PO-IMP-${Date.now().toString().slice(-6)}`;
        await prisma.purchaseOrder.create({
            data: {
                id: orderId,
                type: "Inbound",
                status: "Received",
                date: new Date(),
                workspaceId,
                totalAmount: importedItems.reduce((acc, curr) => acc + (curr.quantity * curr.costPrice), 0),
                items: {
                    create: importedItems.map(item => ({
                        productId: item.productId,
                        quantity: item.quantity,
                        costPrice: item.costPrice
                    }))
                }
            }
        });
    }

    return NextResponse.json({ success: true, successCount, failCount, errors });

  } catch (error) {
    console.error("Import failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
