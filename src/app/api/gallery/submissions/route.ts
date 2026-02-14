import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// 获取待审核的提交列表 (仅管理员)
export async function GET(request: Request) {
  try {
    const session = await getSession();
    const user = session?.user as { role?: string } | undefined;
    
    if (!session || user?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "pending";

    const where: any = {};
    if (status !== "all") {
      where.status = status;
    }

    const submissions = await prisma.gallerySubmission.findMany({
      where,
      orderBy: {
        createdAt: 'desc'
      }
    });

    return NextResponse.json(submissions);
  } catch (error) {
    console.error("Failed to fetch gallery submissions:", error);
    return NextResponse.json({ error: "Failed to fetch gallery submissions" }, { status: 500 });
  }
}

// 提交审核申请 (公开)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { urls, sku, productName, productId } = body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: "At least one image is required" }, { status: 400 });
    }

    if (!sku && !productName && !productId) {
      return NextResponse.json({ error: "Either SKU, product name, or product ID is required" }, { status: 400 });
    }

    const submission = await prisma.gallerySubmission.create({
      data: {
        urls,
        sku,
        productName,
        productId,
        status: "pending"
      }
    });

    return NextResponse.json(submission);
  } catch (error) {
    console.error("Failed to create gallery submission:", error);
    return NextResponse.json({ error: "Failed to create gallery submission" }, { status: 500 });
  }
}
