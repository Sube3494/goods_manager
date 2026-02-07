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

    for (const item of products) {
        try {
            // Map keys (assuming headers might be Chinese or English)
            const name = item.name || item['商品名称'] || item['Name'];
            if (!name) {
                failCount++;
                continue;
            }

            const price = Number(item.price || item['价格'] || item['Price'] || 0);
            const stock = Number(item.stock || item['库存'] || item['Stock'] || 0);
            const sku = String(item.sku || item['SKU'] || item['编码'] || "");
            
            // Try to find category
            let categoryId = item.categoryId;
            const categoryName = item.category || item['分类'] || item['Category'];

            if (!categoryId && categoryName) {
                const cat = await prisma.category.findFirst({
                    where: { name: String(categoryName) }
                });
                if (cat) categoryId = cat.id;
                else {
                    // Option: Create category?
                    // For now, fail or skip or put in default?
                    // Let's create it to be helpful
                    const newCat = await prisma.category.create({
                        data: { name: String(categoryName) }
                    });
                    categoryId = newCat.id;
                }
            }

            if (!categoryId) {
                // Determine a default or skip
                // For this fix, let's find ANY category or create "Uncategorized"
                 let defaultCat = await prisma.category.findFirst({ where: { name: "未分类" } });
                 if (!defaultCat) {
                     defaultCat = await prisma.category.create({ data: { name: "未分类" } });
                 }
                 categoryId = defaultCat.id;
            }

            await prisma.product.create({
                data: {
                    name: String(name),
                    price,
                    stock,
                    sku,
                    categoryId,
                    // supplierId: ... (ignore for now unless provided)
                    isPublic: true
                }
            });
            successCount++;

        } catch (e) {
            console.error("Import item error:", e);
            failCount++;
        }
    }

    return NextResponse.json({ success: true, successCount, failCount });

  } catch (error) {
    console.error("Import failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
