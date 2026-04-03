import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { SessionUser } from "@/lib/permissions";
import { getStorageStrategy } from "@/lib/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    const { productId } = await params;

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        category: { select: { name: true } },
        gallery: {
          where: (!session || !session.id)
            ? { isPublic: true }
            : (session.role === "SUPER_ADMIN" ? {} : {
                OR: [
                  { isPublic: true },
                  { userId: session.id }
                ]
              }),
          orderBy: [
            { sortOrder: "asc" },
            { createdAt: "asc" }
          ]
        }
      }
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const storage = await getStorageStrategy();
    const resolvedProduct = {
      ...product,
      image: product.image ? storage.resolveUrl(product.image) : null
    };

    const items = product.gallery.map((item) => ({
      ...item,
      url: storage.resolveUrl(item.url),
      thumbnailUrl: item.thumbnailUrl ? storage.resolveUrl(item.thumbnailUrl) : storage.resolveUrl(item.url),
      product: resolvedProduct
    }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Failed to fetch gallery product items:", error);
    return NextResponse.json({ error: "Failed to fetch gallery product items" }, { status: 500 });
  }
}
