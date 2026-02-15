import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";

// 获取所有商品
export async function GET() {
  const session = await getFreshSession() as SessionUser | null;
  const workspaceId = session?.workspaceId;
  
  try {
    let products;
    const canReadProducts = session && hasPermission(session, "product:read");

    if (canReadProducts) {
      products = await prisma.product.findMany({
        where: {
          OR: [
            { workspaceId },
            { isPublic: true }
          ]
        },
        include: {
          category: true,
          supplier: true,
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
    } else {
      products = await prisma.product.findMany({
        where: { isPublic: true },
        select: {
          id: true,
          name: true,
          sku: true,
          image: true,
          stock: true,
          isPublic: true,
          createdAt: true,
          categoryId: true,
          category: true,
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
    }
    return NextResponse.json(products);
  } catch (error) {
    console.error("Failed to fetch products:", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}

// 创建新商品
export async function POST(request: Request) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "product:create")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const body = await request.json();
    const { name, sku, costPrice, stock, categoryId, supplierId, image, isPublic } = body;

    const stockNum = Number(stock) || 0;

    const product = await prisma.product.create({
      data: {
        name,
        sku,
        costPrice: Number(costPrice) || 0,
        hideCost: body.hideCost ?? false,
        stock: stockNum,
        categoryId: categoryId || undefined,
        supplierId: supplierId || null,
        image,
        isPublic: isPublic ?? true,
        workspaceId: session.workspaceId,
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
          type: "Inbound",
          status: "Received",
          totalAmount: 0,
          date: new Date(),
          workspaceId: session.workspaceId,
          items: {
            create: [{
              productId: product.id,
              supplierId: supplierId || null,
              quantity: stockNum,
              costPrice: 0
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
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "product:update")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const body = await request.json();
    const { id, name, sku, costPrice, stock, categoryId, supplierId, image, isPublic } = body;

    if (!id) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    const existing = await prisma.product.findFirst({
      where: { 
        id,
        workspaceId: session.workspaceId
      }
    });

    if (!existing) {
      return NextResponse.json({ error: "Product not found in this workspace" }, { status: 404 });
    }

    const updatedProduct = await prisma.product.update({
      where: { id },
      data: {
        name,
        sku,
        costPrice: costPrice !== undefined ? Math.max(0, Number(costPrice) || 0) : undefined,
        hideCost: body.hideCost !== undefined ? body.hideCost : undefined,
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

    return NextResponse.json(updatedProduct);
  } catch (error) {
    console.error("Failed to update product:", error);
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
  }
}

// 删除商品
export async function DELETE(request: Request) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "product:delete")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    // Security check: Verify product belongs to user's workspace
    const product = await prisma.product.findFirst({
      where: { id, workspaceId: session.workspaceId }
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found in this workspace" }, { status: 404 });
    }

    // Delete related records first to avoid foreign key constraint errors
    // 1. Delete gallery items
    await prisma.galleryItem.deleteMany({
      where: { productId: id, workspaceId: session.workspaceId }
    });

    // 2. Delete purchase order items (Cascaded by purchaseOrder, but for safety in logical isolation)
    // Actually, purchaseOrder itself has the workspaceId, so we just need to delete the product
    // cascading takes care of the items if defined, but we need to ensure isolation.

    // 3. Finally delete the product
    await prisma.product.delete({
      where: { id, workspaceId: session.workspaceId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete product:", error);
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
  }
}
