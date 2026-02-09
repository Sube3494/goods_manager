import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// 获取所有商品
export async function GET() {
  const session = await getSession();
  
  try {
    const products = await prisma.product.findMany({
      where: session ? {} : { isPublic: true },
      include: {
        category: true,
        supplier: true,
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    return NextResponse.json(products);
  } catch (error) {
    console.error("Failed to fetch products:", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}

// 创建新商品
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const { name, sku, price, stock, categoryId, supplierId, image, isPublic } = body;

    const stockNum = Number(stock) || 0;

    const product = await prisma.product.create({
      data: {
        name,
        sku,
        price: Number(price) || 0,
        stock: stockNum,
        categoryId: categoryId || undefined,
        supplierId: supplierId || null,
        image,
        isPublic: isPublic ?? true,
      },
      include: {
        category: true,
      }
    });

    // 如果初始库存大于 0，自动生成一张“已入库”状态的采购单作为凭证
    if (stockNum > 0) {
      const orderId = `PO-INIT-${Date.now().toString().slice(-6)}`;
      await prisma.purchaseOrder.create({
        data: {
          id: orderId,
          status: "Received",
          totalAmount: 0, // 初始库存可能没有准确的进货价记录，暂记为 0 或同步售价
          date: new Date(),
          items: {
            create: [{
              productId: product.id,
              supplierId: supplierId || null,
              quantity: stockNum,
              costPrice: 0 // 初始录入成本暂定为 0
            }]
          }
        }
      });
    }

    return NextResponse.json(product);
  } catch (error: unknown) {
    console.error("Failed to create product:", error);
    
    // Handle Prisma Foreign Key Constraint Violated error
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2003') {
      return NextResponse.json({ 
        error: "无效的分类或供应商 ID，请检查关联选项" 
      }, { status: 400 });
    }

    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}

// 更新商品
export async function PUT(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const { id, name, sku, price, stock, categoryId, supplierId, image, isPublic } = body;

    if (!id) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    const product = await prisma.product.update({
      where: { id },
      data: {
        name,
        sku,
        price: Number(price) || 0,
        stock: Number(stock) || 0,
        categoryId: categoryId || undefined,
        supplierId: supplierId || null,
        image,
        isPublic: isPublic ?? true,
      },
      include: {
        category: true,
      }
    });

    return NextResponse.json(product);
  } catch (error) {
    console.error("Failed to update product:", error);
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
  }
}

// 删除商品
export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    // Delete related records first to avoid foreign key constraint errors
    // 1. Delete gallery items
    await prisma.galleryItem.deleteMany({
      where: { productId: id }
    });

    // 2. Delete purchase order items
    await prisma.purchaseOrderItem.deleteMany({
      where: { productId: id }
    });

    // 3. Finally delete the product
    await prisma.product.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete product:", error);
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
  }
}
