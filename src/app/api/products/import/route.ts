import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { pinyin } from "pinyin-pro";

function generatePinyinSearchText(name: string): string {
  if (!name) return "";
  const fullPinyin = pinyin(name, { toneType: 'none', type: 'string', v: true }).replace(/\s+/g, '');
  const firstLetters = pinyin(name, { pattern: 'first', toneType: 'none', type: 'string' }).replace(/\s+/g, '');
  return `${fullPinyin} ${firstLetters}`.toLowerCase();
}

const INVALID_SUPPLIERS = ["未知供应商", "暂无", "无", "无供应商", "空", "-", "N/A", "未知"];
function isInvalidSupplier(name: string): boolean {
  if (!name) return true;
  return INVALID_SUPPLIERS.includes(name.trim());
}


export async function POST(request: Request) {
  try {
    const session = await getAuthorizedUser() as SessionUser | null;
    const userId = session?.id;
    if (!session || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPermission(session, "product:create") || !hasPermission(session, "product:update")) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
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
            // 1. 基础数据解析
            const name = String(item['商品名称'] || item.name || "");
            const image = String(item['商品图片'] || item.image || item['图片'] || "");
            const categoryName = String(item['分类'] || item.category || "");
            const supplierName = String(item['供应商'] || item['supplier'] || "");
            const isPublicText = String(item['公开状态'] || item.isPublic || "");
            const isPublic = isPublicText === "私有" || isPublicText === "否" || isPublicText === "false" ? false : true;

            const isDiscontinuedText = String(item['生产状态'] || item.isDiscontinued || "");
            const isDiscontinued = isDiscontinuedText === "已停产" || isDiscontinuedText === "是" || isDiscontinuedText === "true" ? true : false;
            
            const remarkText = String(item['备注'] || item.remark || "");

            // 2. 解析规格参数 (specs)
            const specs: Record<string, string> = {};
            
            // A. 解析单列合并格式 (e.g., "重量: 10kg\n尺寸: 大")
            const mergedSpecsText = String(item['商品参数'] || "");
            if (mergedSpecsText) {
                const lines = mergedSpecsText.split(/[\n;；]/);
                lines.forEach(line => {
                    const separatorIndex = line.indexOf(':');
                    const separatorIndexZh = line.indexOf('：');
                    const finalIndex = separatorIndex !== -1 ? separatorIndex : separatorIndexZh;
                    
                    if (finalIndex !== -1) {
                        const key = line.substring(0, finalIndex).trim();
                        const val = line.substring(finalIndex + 1).trim();
                        if (key && val) {
                            specs[key] = val;
                        }
                    }
                });
            }

            // B. 解析展平列格式 (兼容模式, e.g., "参数:重量")
            Object.entries(item).forEach(([key, val]) => {
                if (key.startsWith('参数:') && val) {
                    const specKey = key.replace('参数:', '');
                    specs[specKey] = String(val);
                }
            });
 
            // 3. 解析多图库图片 (gallery)
            const galleryText = String(item['图库图片'] || "");
            const galleryUrls = galleryText ? galleryText.split(/[\n,，]/).map(url => url.trim()).filter(Boolean) : [];

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
                if (session.role !== "SUPER_ADMIN" && product.userId !== userId) {
                    failCount++;
                    errors.push({ sku, reason: "该 SKU 属于其他用户，无法更新" });
                    continue;
                }

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
                    costPrice: newCostPrice,
                    pinyin: name ? generatePinyinSearchText(name) : undefined,
                    isPublic,
                    isDiscontinued,
                    specs: Object.keys(specs).length > 0 ? specs : undefined,
                    ...(remarkText ? { remark: remarkText } : {})
                };

                // Handle supplier update
                if (supplierName && !isInvalidSupplier(supplierName)) {
                    let supplier = await prisma.supplier.findFirst({
                        where: { name: supplierName, userId }
                    });
                    if (!supplier) {
                        // Generate code
                        const lastSupplier = await prisma.supplier.findFirst({
                            where: { userId, code: { startsWith: 'SUP-' } },
                            orderBy: { code: 'desc' }
                        });
                        let nextNumber = 1;
                        if (lastSupplier?.code) {
                            const lastNumber = parseInt(lastSupplier.code.split('-')[1]);
                            if (!isNaN(lastNumber)) nextNumber = lastNumber + 1;
                        }
                        const newCode = `SUP-${String(nextNumber).padStart(3, '0')}`;

                        supplier = await prisma.supplier.create({
                            data: { 
                                name: supplierName, 
                                code: newCode,
                                userId, 
                                contact: "", phone: "", email: "", address: "" 
                            }
                        });
                    }
                    updateData.supplierId = supplier.id;
                }



                if (quantity > 0) {
                    updateData.stock = { increment: quantity };
                }

                // 处理主图
                if (image && image !== "暂无图片") {
                    let finalImage: string = image;
                    const uploadIndex = finalImage.indexOf('/uploads/');
                    if (uploadIndex !== -1) {
                        finalImage = finalImage.substring(uploadIndex);
                    }
                    updateData.image = finalImage;
                    
                    if (!galleryUrls.includes(finalImage)) {
                        galleryUrls.push(finalImage);
                    }
                }

                await prisma.product.update({
                    where: { id: product.id },
                    data: updateData
                });

                // 处理图库同步 (Sync Gallery)
                if (galleryUrls.length > 0) {
                    for (const gUrl of galleryUrls) {
                        const uploadIndex = gUrl.indexOf('/uploads/');
                        const cleanedUrl = uploadIndex !== -1 ? gUrl.substring(uploadIndex) : gUrl;
                        
                        const existing = await prisma.galleryItem.findFirst({
                            where: { productId: product.id, url: cleanedUrl }
                        });
                        if (!existing) {
                            await prisma.galleryItem.create({
                                data: {
                                    url: cleanedUrl,
                                    productId: product.id,
                                    userId,
                                    isPublic: true
                                }
                            });
                        }
                    }
                }

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

                // Handle Category
                let finalCategoryId: string;
                if (categoryName) {
                    let category = await prisma.category.findFirst({
                        where: session.role === "SUPER_ADMIN"
                          ? { name: categoryName }
                          : { name: categoryName, userId }
                    });
                    
                    if (!category) {
                        category = await prisma.category.create({
                            data: { name: categoryName, userId }
                        });
                    }
                    finalCategoryId = category.id;
                } else {
                    const defaultCat = await prisma.category.findFirst({
                        where: session.role === "SUPER_ADMIN"
                          ? { name: "其他分类" }
                          : { name: "其他分类", userId }
                    });
                    if (defaultCat) {
                        finalCategoryId = defaultCat.id;
                    } else {
                        const newDefaultCat = await prisma.category.create({
                            data: { name: "其他分类", userId }
                        });
                        finalCategoryId = newDefaultCat.id;
                    }
                }

                let finalMainImage: string | undefined = undefined;
                if (image && image !== "暂无图片") {
                    const tempMainImage: string = image;
                    const uploadIndex = tempMainImage.indexOf('/uploads/');
                    if (uploadIndex !== -1) {
                        finalMainImage = tempMainImage.substring(uploadIndex);
                    } else {
                        finalMainImage = tempMainImage;
                    }
                }

                // Handle Supplier
                let finalSupplierId: string | undefined = undefined;
                if (supplierName && !isInvalidSupplier(supplierName)) {
                    let supplier = await prisma.supplier.findFirst({
                        where: { name: supplierName, userId }
                    });
                    if (!supplier) {
                        // Generate code
                        const lastSupplier = await prisma.supplier.findFirst({
                            where: { userId, code: { startsWith: 'SUP-' } },
                            orderBy: { code: 'desc' }
                        });
                        let nextNumber = 1;
                        if (lastSupplier?.code) {
                            const lastNumber = parseInt(lastSupplier.code.split('-')[1]);
                            if (!isNaN(lastNumber)) nextNumber = lastNumber + 1;
                        }
                        const newCode = `SUP-${String(nextNumber).padStart(3, '0')}`;

                        supplier = await prisma.supplier.create({
                            data: { 
                                name: supplierName, 
                                code: newCode,
                                userId, 
                                contact: "", phone: "", email: "", address: "" 
                            }
                        });
                    }
                    finalSupplierId = supplier.id;
                }


                const newProduct = await prisma.product.create({
                    data: {
                        sku,
                        name,
                        categoryId: finalCategoryId as string,
                        supplierId: finalSupplierId,
                        costPrice: costPrice > 0 ? costPrice : 0,
                        stock: quantity > 0 ? quantity : 0,
                        image: finalMainImage,
                        pinyin: generatePinyinSearchText(name),
                        userId,
                        isPublic,
                        isDiscontinued,
                        remark: remarkText || undefined,
                        specs: Object.keys(specs).length > 0 ? specs : undefined
                    }
                });


                // 处理图库 (Gallery)
                const allGalleryToCreate = [...galleryUrls];
                if (finalMainImage && !allGalleryToCreate.includes(finalMainImage)) {
                    allGalleryToCreate.push(finalMainImage);
                }

                for (const gUrl of allGalleryToCreate) {
                    const uploadIndex = gUrl.indexOf('/uploads/');
                    const cleanedUrl = uploadIndex !== -1 ? gUrl.substring(uploadIndex) : gUrl;
                    await prisma.galleryItem.create({
                        data: {
                            url: cleanedUrl,
                            productId: newProduct.id,
                            userId,
                            isPublic: true
                        }
                    });
                }

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
                userId,
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
