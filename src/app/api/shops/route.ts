import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";

// GET: 获取所有店铺
export async function GET() {
  try {
    const user = await getAuthorizedUser("logistics:manage");
    if (!user) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const shops = await prisma.shop.findMany({
      where: user.role === "SUPER_ADMIN" ? {} : { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ shops });
  } catch (error) {
    console.error("Failed to fetch shops:", error);
    return NextResponse.json({ error: "Failed to fetch shops" }, { status: 500 });
  }
}

// POST: 创建新店铺
export async function POST(request: Request) {
  try {
    const user = await getAuthorizedUser("logistics:manage");
    if (!user) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { name, externalId, address, province, city, latitude, longitude, isSource, contactName, contactPhone, remark } = body;

    if (!name || !externalId || !address) {
      return NextResponse.json({ error: "Missing required shop fields" }, { status: 400 });
    }

    const newShop = await prisma.shop.create({
      data: {
        name,
        externalId,
        address,
        province,
        city,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        isSource: isSource ?? true,
        contactName,
        contactPhone,
        remark,
        userId: user.id,
      },
    });

    return NextResponse.json({ shop: newShop });
  } catch (error) {
    console.error("Failed to create shop:", error);
    return NextResponse.json({ error: "Failed to create shop" }, { status: 500 });
  }
}
