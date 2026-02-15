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
            // Map keys for SKU and Quantity (Supporting both internal formats and exported headers)
            const sku = String(item.sku || item['SKU/店内码'] || item['SKU'] || item['编码'] || item['*SKU'] || "");
            const quantity = Number(item['入库数量'] || item['*入库数量'] || item['当前库存'] || item.stock || item['数量'] || item['Quantity'] || 0);
            const costPrice = Number(item['进货单价'] || item['*进货单价'] || item['成本价'] || item['*成本价'] || item['成本价格'] || item.costPrice || item['Cost Price'] || 0);
            const image = String(item['商品图片'] || item.image || item['图片'] || "");
            const name = String(item['商品名称'] || item.name || "");
            const categoryName = String(item['分类'] || item.category || "");
            
            if (!sku) {
                failCount++;
                errors.push({ sku: "未知", reason: "未填写 SKU" });
                continue;
            }

            // Find existing product by SKU GLOBALLY
            const product = await prisma.product.findUnique({
                where: { sku: sku }
            });

            if (product) {
                // UPDATE: Replenishment & metadata update
                const currentStock = product.stock;
                const currentCost = product.costPrice || 0;
                
                let newCostPrice = currentCost;
                
                if (costPrice > 0 && quantity > 0) {
                    if (currentStock <= 0) {
                        newCostPrice = costPrice;
                    } else {
                        const totalValue = (currentStock * currentCost) + (quantity * costPrice);
                        const totalQty = currentStock + quantity;
                        newCostPrice = totalValue / totalQty;
                    }
                }

                const updateData: Record<string, unknown> = {
                    costPrice: newCostPrice
                };

                if (quantity > 0) {
                    updateData.stock = { increment: quantity };
                }

                if (image && image !== "暂无图片") {
                    let finalImage = image;
                    const uploadIndex = finalImage.indexOf('/uploads/');
                    if (uploadIndex !== -1) {
                        finalImage = finalImage.substring(uploadIndex);
                    } else if (finalImage.startsWith('http')) {
                        try {
                            const url = new URL(finalImage);
                            if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.startsWith('192.168.')) {
                                finalImage = url.pathname + url.search;
                            }
                        } catch { }
                    }
                    updateData.image = finalImage;
                }

                await prisma.product.update({
                    where: { id: product.id },
                    data: updateData
                });

                if (quantity > 0) {
                    importedItems.push({
                        productId: product.id,
                        quantity: quantity,
                        costPrice: costPrice
                    });
                }
                successCount++;
            } else {
                // CREATE: If SKU doesn't exist, create a new product
                if (!name) {
                    failCount++;
                    errors.push({ sku, reason: "系统内未找到该 SKU，且导入数据中缺少商品名称，无法创建商品" });
                    continue;
                }

                // Handle Category for new product
                let finalCategoryId: string;
                if (categoryName) {
                    let category = await prisma.category.findFirst({
                        where: { name: categoryName }
                    });
                    
                    if (!category) {
                        category = await prisma.category.create({
                            data: { name: categoryName, workspaceId }
                        });
                    }
                    finalCategoryId = category.id;
                } else {
                    // Try to find or create a default category if none exists
                    const defaultCat = await prisma.category.findFirst({
                        where: { name: "其他分类" }
                    });
                    if (defaultCat) {
                        finalCategoryId = defaultCat.id;
                    } else {
                        const newDefaultCat = await prisma.category.create({
                            data: { name: "其他分类", workspaceId }
                        });
                        finalCategoryId = newDefaultCat.id;
                    }
                }

                let finalImage: string | undefined = undefined;
                if (image && image !== "暂无图片") {
                    finalImage = image;
                    const uploadIndex = finalImage.indexOf('/uploads/');
                    if (uploadIndex !== -1) {
                        finalImage = finalImage.substring(uploadIndex);
                    }
                }

                const newProduct = await prisma.product.create({
                    data: {
                        sku,
                        name,
                        categoryId: finalCategoryId as string,
                        costPrice: costPrice > 0 ? costPrice : 0,
                        stock: quantity > 0 ? quantity : 0,
                        image: finalImage,
                        workspaceId,
                        isPublic: true
                    }
                });

                if (quantity > 0) {
                    importedItems.push({
                        productId: newProduct.id,
                        quantity: quantity,
                        costPrice: costPrice > 0 ? costPrice : 0
                    });
                }
                successCount++;
            }
        } catch (e) {
            console.error("Import item error:", e);
            const sku = item.sku || item['SKU/店内码'] || "未知";
            failCount++;
            errors.push({ sku: String(sku), reason: "数据解析或数据库更新失败" });
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
