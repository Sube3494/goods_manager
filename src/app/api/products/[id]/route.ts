import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getStorageStrategy } from "@/lib/storage";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        supplier: true,
        gallery: true,
        orderItems: {
          include: {
            purchaseOrder: true
          }
        }
      }
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json(product);
  } catch {
    return NextResponse.json({ error: "Failed to fetch product" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const body = await request.json();
    const { name, sku, costPrice, stock, categoryId, supplierId, image, isPublic } = body;

    const product = await prisma.product.update({
      where: { id },
      data: {
        name,
        sku,
        costPrice: Number(costPrice || body.price), // Fallback to price if costPrice is missing for compatibility
        stock: Number(stock),
        categoryId,
        supplierId,
        image,
        isPublic
      }
    });

    return NextResponse.json(product);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return NextResponse.json({ 
        error: "商品编码 (SKU) 已存在，请使用其他编码" 
      }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;

    // 获取待删除商品及其关联相册数据
    const product = await prisma.product.findUnique({
      where: { id },
      include: { gallery: true }
    });

    if (product) {
      try {
        const storage = await getStorageStrategy();
        const urlsToDelete: string[] = [];

        // 商品主图
        if (product.image) urlsToDelete.push(product.image);
        // 相册图片
        product.gallery.forEach(item => {
          if (item.url) urlsToDelete.push(item.url);
        });

        // 执行物理删除
        await Promise.allSettled(
          urlsToDelete.map(url => storage.delete(url))
        );
      } catch (storageError) {
        console.error("Product physical file deletion failed:", storageError);
      }

      await prisma.product.delete({
        where: { id }
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
  }
}
