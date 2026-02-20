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

    const data = await request.json();
    const { "商品列表": products, "分类列表": categories, "供应商列表": suppliers } = data;

    // Check system setting for data import
    const settings = await prisma.systemSetting.findUnique({
      where: { id: "system" }
    });

    if (settings && !settings.allowDataImport) {
      return NextResponse.json({ error: "系统已关闭数据导入功能" }, { status: 403 });
    }

    let successCount = 0;
    let failCount = 0;
    const errors: { name: string; reason: string }[] = [];

    // Use a transaction for the entire import process
    const result = await prisma.$transaction(async (tx) => {
      // 1. Process Categories
      if (Array.isArray(categories)) {
        for (const cat of categories) {
          const name = cat["分类名称"];
          if (name) {
            await tx.category.upsert({
              where: { name_workspaceId: { name, workspaceId } },
              update: {},
              create: { name, workspaceId }
            });
          }
        }
      }

      // 2. Process Suppliers
      if (Array.isArray(suppliers)) {
        for (const sup of suppliers) {
          const name = sup["供应商名称"];
          const code = sup["编号"] || null;
          if (name) {
            // Upsert by name if code is missing, otherwise by code
            if (code) {
              await tx.supplier.upsert({
                where: { code_workspaceId: { code, workspaceId } },
                update: { name, contact: sup["联系人"] || null, phone: sup["电话"] || null, address: sup["地址"] || null },
                create: { code, name, contact: sup["联系人"] || null, phone: sup["电话"] || null, address: sup["地址"] || null, workspaceId }
              });
            } else {
              // Fallback to name-based logic (simplified for this context)
              const existingS = await tx.supplier.findFirst({ 
                  where: { name, workspaceId } 
              });
              if (existingS) {
                  await tx.supplier.update({
                      where: { id: existingS.id },
                      data: { contact: sup["联系人"] || null, phone: sup["电话"] || null, address: sup["地址"] || null }
                  });
              } else {
                  await tx.supplier.create({
                      data: { name, contact: sup["联系人"] || null, phone: sup["电话"] || null, address: sup["地址"] || null, workspaceId }
                  });
              }
            }
          }
        }
      }

      // 3. Process Products
      if (Array.isArray(products)) {
        for (const p of products) {
          try {
            const sku = String(p["SKU"] || "");
            const name = p["商品名称"];
            const catName = p["分类"];
            const supName = p["供应商"];
            
            if (!sku || !name) {
              failCount++;
              errors.push({ name: name || sku || "未知", reason: "缺少 SKU 或商品名称" });
              continue;
            }

            // Find or create category
            let categoryId = "";
            if (catName) {
              const cat = await tx.category.findUnique({ 
                  where: { name_workspaceId: { name: catName, workspaceId } } 
              });
              if (cat) {
                categoryId = cat.id;
              } else {
                const newCat = await tx.category.create({ 
                    data: { name: catName, workspaceId } 
                });
                categoryId = newCat.id;
              }
            } else {
                // Find or create 'Mixed' category
                const cat = await tx.category.upsert({
                    where: { name_workspaceId: { name: "未分类", workspaceId } },
                    update: {},
                    create: { name: "未分类", workspaceId }
                });
                categoryId = cat.id;
            }

            // Find supplier
            let supplierId = null;
            if (supName && supName !== "无") {
              const sup = await tx.supplier.findFirst({ 
                  where: { name: supName, workspaceId } 
              });
              if (sup) {
                supplierId = sup.id;
              }
            }

            await tx.product.upsert({
              where: { sku },
              update: {
                name,
                categoryId,
                supplierId,
                stock: Number(p["库存数量"] || 0),
                costPrice: Number(p["成本价"] || 0)
              },
              create: {
                sku,
                name,
                categoryId,
                supplierId,
                stock: Number(p["库存数量"] || 0),
                costPrice: Number(p["成本价"] || 0),
                workspaceId
              }
            });

            successCount++;
          } catch {
            failCount++;
            errors.push({ name: p["商品名称"] || "未知", reason: "产品处理失败" });
          }
        }
      }

      return { successCount, failCount, errors };
    });

    return NextResponse.json({ success: true, ...result });

  } catch (error) {
    console.error("System Import failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
