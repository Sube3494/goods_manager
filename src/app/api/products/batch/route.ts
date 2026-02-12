import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function DELETE(request: NextRequest) {
  try {
    const { ids } = await request.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "Invalid request: ids array is required" },
        { status: 400 }
      );
    }

    // Delete products in batch
    // First, delete related records to avoid foreign key constraint errors
    // 1. Delete gallery items
    await prisma.galleryItem.deleteMany({
      where: {
        productId: {
          in: ids
        }
      }
    });

    // 2. Delete purchase order items
    await prisma.purchaseOrderItem.deleteMany({
      where: {
        productId: {
          in: ids
        }
      }
    });

    // 3. Finally delete the products
    const result = await prisma.product.deleteMany({
      where: {
        id: {
          in: ids
        }
      }
    });

    return NextResponse.json({
      success: true,
      count: result.count,
      message: `Successfully deleted ${result.count} product(s)`
    });
  } catch (error) {
    console.error("Batch delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete products" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { ids, categoryId, supplierId } = await request.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "Invalid request: ids array is required" },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (categoryId) updateData.categoryId = categoryId;
    if (supplierId) updateData.supplierId = supplierId;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No update data provided" },
        { status: 400 }
      );
    }

    const result = await prisma.product.updateMany({
      where: {
        id: {
          in: ids
        }
      },
      data: updateData
    });

    return NextResponse.json({
      success: true,
      count: result.count,
      message: `Successfully updated ${result.count} product(s)`
    });
  } catch (error) {
    console.error("Batch update error:", error);
    return NextResponse.json(
      { error: "Failed to update products" },
      { status: 500 }
    );
  }
}
