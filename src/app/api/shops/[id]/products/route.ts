import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";

async function getOwnedShop(shopId: string, userId: string, isAdmin: boolean) {
  return prisma.shop.findFirst({
    where: isAdmin ? { id: shopId } : { id: shopId, userId },
    select: { id: true, name: true, userId: true },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthorizedUser("product:update");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    }

    const { id: shopId } = await params;
    const shop = await getOwnedShop(shopId, user.id, user.role === "SUPER_ADMIN");
    if (!shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    const body = await request.json();
    const productIds = Array.isArray(body?.productIds)
      ? body.productIds.map((item: unknown) => String(item)).filter(Boolean)
      : [];

    if (productIds.length === 0) {
      return NextResponse.json({ error: "Missing product IDs" }, { status: 400 });
    }

    const products = await prisma.product.findMany({
      where: user.role === "SUPER_ADMIN"
        ? { id: { in: productIds }, isPublic: true }
        : { id: { in: productIds }, userId: user.id, isPublic: true },
      select: { id: true },
    });

    if (products.length === 0) {
      return NextResponse.json({ error: "没有可加入店铺的公开商品" }, { status: 404 });
    }

    const result = await prisma.shopProduct.createMany({
      data: products.map((product) => ({
        shopId,
        productId: product.id,
      })),
      skipDuplicates: true,
    });

    return NextResponse.json({
      success: true,
      count: result.count,
      message: `成功加入 ${shop.name}`,
    });
  } catch (error) {
    console.error("Failed to assign products to shop:", error);
    return NextResponse.json({ error: "Failed to assign products to shop" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthorizedUser("product:update");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    }

    const { id: shopId } = await params;
    const shop = await getOwnedShop(shopId, user.id, user.role === "SUPER_ADMIN");
    if (!shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    const body = await request.json();
    const productIds = Array.isArray(body?.productIds)
      ? body.productIds.map((item: unknown) => String(item)).filter(Boolean)
      : [];

    if (productIds.length === 0) {
      return NextResponse.json({ error: "Missing product IDs" }, { status: 400 });
    }

    const result = await prisma.shopProduct.deleteMany({
      where: {
        shopId,
        productId: { in: productIds },
        ...(user.role === "SUPER_ADMIN" ? {} : { product: { userId: user.id } }),
      },
    });

    return NextResponse.json({
      success: true,
      count: result.count,
      message: `已从 ${shop.name} 移出 ${result.count} 个商品`,
    });
  } catch (error) {
    console.error("Failed to remove products from shop:", error);
    return NextResponse.json({ error: "Failed to remove products from shop" }, { status: 500 });
  }
}
