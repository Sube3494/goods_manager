import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { SessionUser } from "@/lib/permissions";

// 自动初始化默认商品库并处理历史商品数据归属
async function ensureDefaultLibraries() {
  // 1. 确保普通商品库存在
  const publicLib = await prisma.productLibrary.upsert({
    where: { code: "public" },
    update: {},
    create: {
      name: "普通商品库",
      code: "public",
      isPublic: true,
    },
  });

  // 2. 确保保密商品库存在
  await prisma.productLibrary.upsert({
    where: { code: "secret" },
    update: {},
    create: {
      name: "保密商品库",
      code: "secret",
      isPublic: false,
    },
  });

  // 3. 将所有历史无商品库关联 of 商品一并归属到“普通商品库”中
  const unassignedCount = await prisma.product.count({
    where: { libraryId: null },
  });

  if (unassignedCount > 0) {
    await prisma.product.updateMany({
      where: { libraryId: null },
      data: { libraryId: publicLib.id },
    });
    console.log(`Migrated ${unassignedCount} legacy products to public library.`);
  }

  return publicLib;
}

export async function GET() {
  try {
    const session = await getFreshSession() as SessionUser | null;
    
    // 强制执行初始化以确保基础数据存在
    await ensureDefaultLibraries();

    // 默认所有人都可以访问公开库。如果未登录或无有效账号，仅返回公开库。
    if (!session || !session.id) {
      const publicLibs = await prisma.productLibrary.findMany({
        where: { isPublic: true },
        include: {
          _count: {
            select: { products: true }
          }
        },
        orderBy: { createdAt: "asc" },
      });
      return NextResponse.json(publicLibs);
    }

    // 如果是超级管理员，可以直接获取所有库
    if (session.role === "SUPER_ADMIN") {
      const allLibs = await prisma.productLibrary.findMany({
        include: {
          _count: {
            select: { products: true }
          }
        },
        orderBy: { createdAt: "asc" },
      });
      return NextResponse.json(allLibs);
    }

    // 获取公开库 + 显式被授权可见的私有库
    const libraries = await prisma.productLibrary.findMany({
      where: {
        OR: [
          { isPublic: true },
          {
            authorizedUsers: {
              some: { id: session.id }
            }
          }
        ]
      },
      include: {
        _count: {
          select: { products: true }
        }
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(libraries);
  } catch (error) {
    console.error("Failed to fetch product libraries:", error);
    return NextResponse.json({ error: "Failed to fetch libraries" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { name, isPublic } = await request.json();
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "商品库名称不能为空" }, { status: 400 });
    }

    const trimmedName = name.trim();
    const created = await prisma.productLibrary.create({
      data: {
        name: trimmedName,
        code: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        isPublic: false,
      }
    });

    return NextResponse.json(created);
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "商品库名称已存在" }, { status: 409 });
    }
    console.error("Failed to create product library:", error);
    return NextResponse.json({ error: "Failed to create library" }, { status: 500 });
  }
}
