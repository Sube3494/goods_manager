import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { products } = await request.json();



    if (!Array.isArray(products) || products.length === 0) {
        return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }

    let successCount = 0;
    let failCount = 0;

    // Simple implementation: Loop and create. For better performance use createMany if possible,
    // but createMany doesn't support generic relations easily (need IDs).
    // Here we might need to lookup category by name.

    const importedItems: { productId: string, quantity: number, costPrice: number }[] = [];

    for (const item of products) {
        try {
            // Map keys for SKU and Quantity
            const sku = String(item.sku || item['SKU'] || item['编码'] || item['*SKU'] || "");
            const quantity = Number(item['入库数量'] || item['*入库数量'] || item.stock || item['数量'] || item['Quantity'] || 0);
            
            if (!sku || quantity <= 0) {
                failCount++;
                continue;
            }

            // Find existing product by SKU
            const existingProduct = await prisma.product.findUnique({
                where: { sku }
            });

            if (existingProduct) {
                // Simplified flow: Update existing product stock
                
                await prisma.product.update({
                    where: { id: existingProduct.id },
                    data: {
                        stock: { increment: quantity }
                    }
                });

                importedItems.push({
                    productId: existingProduct.id,
                    quantity: quantity,
                    costPrice: 0 // No longer providing cost price in simple replenishment
                });

                successCount++;
            } else {
                // If SKU doesn't exist, we can't replenish
                console.warn(`Import: SKU ${sku} not found. Skipping.`);
                failCount++;
            }
        } catch (e) {
            console.error("Import item error:", e);
            failCount++;
        }
    }

    // 如果有带库存导入的商品，生成一张批量入库单
    if (importedItems.length > 0) {
        const orderId = `PO-IMP-${Date.now().toString().slice(-6)}`;
        await prisma.purchaseOrder.create({
            data: {
                id: orderId,
                status: "Received",
                date: new Date(),
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

    return NextResponse.json({ success: true, successCount, failCount });

  } catch (error) {
    console.error("Import failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
