import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getLightSession } from "@/lib/auth";

export async function DELETE(request: NextRequest) {
  try {
    const user = await getLightSession();
    if (!user || user.role !== "SUPER_ADMIN" || !user.id) {
      return NextResponse.json(
        { error: "Unauthorized or insufficient permissions" },
        { status: 401 }
      );
    }

    const { ids } = await request.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "Invalid request: ids array is required" },
        { status: 400 }
      );
    }

    const normalizedIds = ids.map((id: unknown) => String(id || "").trim()).filter(Boolean);
    if (normalizedIds.length === 0) {
      return NextResponse.json(
        { error: "Invalid request: ids array is required" },
        { status: 400 }
      );
    }

    const ownedProducts = await prisma.product.findMany({
      where: user.role === "SUPER_ADMIN"
        ? { id: { in: normalizedIds } }
        : { id: { in: normalizedIds }, userId: user.id },
      select: {
        id: true,
        shopProducts: {
          select: {
            id: true,
          },
        },
      },
    });

    const ownedProductIds = ownedProducts.map((product) => product.id);
    const relatedShopProductIds = ownedProducts.flatMap((product) => product.shopProducts.map((item) => item.id));

    if (ownedProductIds.length === 0) {
      return NextResponse.json(
        { error: "没有可删除的商品" },
        { status: 404 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.galleryItem.deleteMany({
        where: {
          productId: {
            in: ownedProductIds,
          },
        },
      });

      await tx.purchaseOrderItem.deleteMany({
        where: {
          OR: [
            {
              productId: {
                in: ownedProductIds,
              },
            },
            relatedShopProductIds.length > 0
              ? {
                  shopProductId: {
                    in: relatedShopProductIds,
                  },
                }
              : undefined,
          ].filter(Boolean) as Array<Record<string, unknown>>,
        },
      });

      await tx.brushOrderItem.deleteMany({
        where: {
          productId: {
            in: ownedProductIds,
          },
        },
      });

      await tx.brushOrderPlanItem.deleteMany({
        where: {
          productId: {
            in: ownedProductIds,
          },
        },
      });

      await tx.storeOpeningItem.deleteMany({
        where: {
          productId: {
            in: ownedProductIds,
          },
        },
      });

      await tx.outboundOrderItem.deleteMany({
        where: {
          OR: [
            {
              productId: {
                in: ownedProductIds,
              },
            },
            relatedShopProductIds.length > 0
              ? {
                  shopProductId: {
                    in: relatedShopProductIds,
                  },
                }
              : undefined,
          ].filter(Boolean) as Array<Record<string, unknown>>,
        },
      });

      if (relatedShopProductIds.length > 0) {
        await tx.shopProduct.deleteMany({
          where: {
            id: {
              in: relatedShopProductIds,
            },
          },
        });
      }

      return await tx.product.deleteMany({
        where: {
          id: {
            in: ownedProductIds,
          },
        },
      });
    });

    return NextResponse.json({
      success: true,
      count: result.count,
      message: `Successfully deleted ${result.count} product(s)`
    });
  } catch (error) {
    console.error("Batch delete error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete products" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getLightSession();
    if (!user || user.role !== "SUPER_ADMIN" || !user.id) {
      return NextResponse.json(
        { error: "Unauthorized or insufficient permissions" },
        { status: 401 }
      );
    }

    const { ids, categoryId, supplierId, isPublic, isDiscontinued, costPrice } = await request.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "Invalid request: ids array is required" },
        { status: 400 }
      );
    }

    const updateData: Record<string, string | number | boolean> = {};
    if (categoryId) updateData.categoryId = categoryId;
    if (supplierId) updateData.supplierId = supplierId;
    if (isPublic !== undefined) updateData.isPublic = isPublic;
    if (isDiscontinued !== undefined) updateData.isDiscontinued = isDiscontinued;
    if (costPrice !== undefined) updateData.costPrice = costPrice;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No update data provided" },
        { status: 400 }
      );
    }

    const normalizedIds = ids.map((id: unknown) => String(id || "").trim()).filter(Boolean);
    const result = await prisma.product.updateMany({
      where: user.role === "SUPER_ADMIN"
        ? {
            id: {
              in: normalizedIds
            }
          }
        : {
            id: {
              in: normalizedIds
            },
            userId: user.id,
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
