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


function extractRowValue(row: Record<string, any>, keys: string[]) {
  const rowKeys = Object.keys(row);
  for (const key of keys) {
    const target = key.toLowerCase();
    const matchedKey = rowKeys.find(rk => {
      const normalizedRowKey = rk.trim().replace(/^\*/, '').toLowerCase();
      return normalizedRowKey === target;
    });
    if (matchedKey) {
      const value = row[matchedKey];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return value;
      }
    }
  }
  return "";
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

    const { products, libraryId } = await request.json();

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

    for (const item of products) {
        try {
            // Map keys for SKU and Quantity (Supporting both internal formats and exported headers)
            const sku = String(extractRowValue(item, ["sku", "SKU/店内码", "SKU", "编码"]) || "");
            const costPrice = Number(extractRowValue(item, ["进货单价", "成本价", "成本价格", "costPrice", "Cost Price"]) || 0);
            // 1. 基础数据解析
            const name = String(extractRowValue(item, ["商品名称", "name", "名称"]) || "");
            const image = String(extractRowValue(item, ["商品图片", "image", "图片", "主图"]) || "");
            const categoryName = String(extractRowValue(item, ["分类", "category", "categoryName", "类目"]) || "");
            const supplierName = String(extractRowValue(item, ["供应商", "supplier"]) || "");
            const isPublicText = String(extractRowValue(item, ["公开状态", "isPublic"]) || "");
            const isPublic = isPublicText === "私有" || isPublicText === "否" || isPublicText === "false" ? false : true;

            const isDiscontinuedText = String(extractRowValue(item, ["生产状态", "isDiscontinued"]) || "");
            const isDiscontinued = isDiscontinuedText === "已停产" || isDiscontinuedText === "是" || isDiscontinuedText === "true" ? true : false;
            
            const remarkText = String(extractRowValue(item, ["备注", "remark"]) || "");

            const isShelfLifeText = String(extractRowValue(item, ["是否管理保质期", "是否保质期管理", "保质期管理", "isShelfLife"]) || "");
            const isShelfLife = isShelfLifeText === "是" || isShelfLifeText === "true" || isShelfLifeText === "1" ? true : false;
            const shelfLifeDays = extractRowValue(item, ["保质期天数", "保质期", "shelfLifeDays"]) ? Number(extractRowValue(item, ["保质期天数", "保质期", "shelfLifeDays"])) : null;

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
                const currentCost = product.costPrice || 0;

                const updateData: Record<string, unknown> = {
                    costPrice: costPrice > 0 ? costPrice : currentCost,
                    pinyin: name ? generatePinyinSearchText(name) : undefined,
                    isPublic,
                    isDiscontinued,
                    isShelfLife,
                    shelfLifeDays: isShelfLife && Number.isFinite(shelfLifeDays) ? shelfLifeDays : null,
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
                        stock: 0,
                        image: finalMainImage,
                        pinyin: generatePinyinSearchText(name),
                        userId,
                        isPublic,
                        isDiscontinued,
                        remark: remarkText || undefined,
                        specs: Object.keys(specs).length > 0 ? specs : undefined,
                        isShelfLife,
                        shelfLifeDays: isShelfLife && Number.isFinite(shelfLifeDays) ? shelfLifeDays : null,
                        libraryId: libraryId || undefined
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
                successCount++;
            }
        } catch (e) {
            console.error("Import item error:", e);
            const sku = item.sku || item['SKU/店内码'] || "未知";
            failCount++;
            errors.push({ sku: String(sku), reason: "数据解析或数据库更新失败" });
        }
    }

    return NextResponse.json({ success: true, successCount, failCount, errors });

  } catch (error) {
    console.error("Import failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
