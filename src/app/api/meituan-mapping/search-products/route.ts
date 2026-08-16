import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthorizedUser("product:read");
    if (!user) {
      return NextResponse.json({ error: "未授权或权限不足" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();

    if (!q) {
      // 默认返回最近活跃的前 20 个商品
      const defaultProducts = await prisma.product.findMany({
        where: {
          OR: [{ userId: user.id }, { isPublic: true }],
        },
        select: {
          id: true,
          name: true,
          sku: true,
          image: true,
          costPrice: true,
          specs: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
      });
      return NextResponse.json({ products: defaultProducts });
    }

    const products = await prisma.product.findMany({
      where: {
        AND: [
          {
            OR: [{ userId: user.id }, { isPublic: true }],
          },
          {
            OR: [
              { sku: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
              { pinyin: { contains: q, mode: "insensitive" } },
            ],
          },
        ],
      },
      select: {
        id: true,
        name: true,
        sku: true,
        image: true,
        costPrice: true,
        specs: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 30,
    });

    return NextResponse.json({ products });
  } catch (error: any) {
    console.error("搜索系统商品失败:", error);
    return NextResponse.json({ error: "搜索商品失败" }, { status: 500 });
  }
}
