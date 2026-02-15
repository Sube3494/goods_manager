import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";

export async function GET() {
  const session = await getFreshSession() as SessionUser | null;
  const workspaceId = session?.workspaceId;

  try {
    const categories = await prisma.category.findMany({
      where: session ? {
        OR: [
          { workspaceId },
          { products: { some: { isPublic: true } } }
        ]
      } : { 
        products: { some: { isPublic: true } } 
      },
      include: {
        _count: {
          select: { products: true }
        }
      },
      orderBy: { name: 'asc' }
    });
    
    // 映射回前端需要的结构
    const formatted = categories.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description || "",

      count: c._count.products
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    console.error("Failed to fetch categories:", error);
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "category:manage")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const body = await request.json();
    const category = await prisma.category.create({
      data: {
        name: body.name,
        description: body.description,
        workspaceId: session.workspaceId,
      }
    });
    return NextResponse.json(category);
  } catch (error) {
    console.error("Failed to create category:", error);
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}
