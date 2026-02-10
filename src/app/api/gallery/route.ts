import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// 获取相册图片
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");

    const session = await getSession();
    const galleryItems = await prisma.galleryItem.findMany({
      where: {
        ...(productId ? { productId } : {}),
        ...(session ? {} : { 
          product: { isPublic: true }
        }),
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            stock: true,
            category: {
              select: {
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    return NextResponse.json(galleryItems);
  } catch (error) {
    console.error("Failed to fetch gallery items:", error);
    return NextResponse.json({ error: "Failed to fetch gallery items" }, { status: 500 });
  }
}

// 上传/创建相册图片
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const { url, urls, productId, tags, isPublic, type } = body;

    // Handle batch creation if urls array is provided
    if (urls && Array.isArray(urls) && urls.length > 0) {
        const data = urls.map((u: any) => ({
            url: typeof u === 'string' ? u : u.url,
            productId,
            tags: tags || [],
            isPublic: isPublic ?? true,
            type: (typeof u !== 'string' && u.type) ? u.type : "image", 
        }));

        const result = await prisma.galleryItem.createMany({
            data
        });
        
        return NextResponse.json({ count: result.count });
    }

    // Fallback to single item creation
    const item = await prisma.galleryItem.create({
      data: {
        url: url || "", // Ensure url is not undefined if falling back
        productId,
        tags: tags || [],
        isPublic: isPublic ?? true,
        type: type || "image",
      }
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error("Failed to create gallery item:", error);
    return NextResponse.json({ error: "Failed to create gallery item" }, { status: 500 });
  }
}
