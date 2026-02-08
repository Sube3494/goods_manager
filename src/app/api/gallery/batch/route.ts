import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { ids } = await request.json();

    if (!ids || !Array.isArray(ids)) {
      return NextResponse.json({ error: "Invalid item IDs" }, { status: 400 });
    }

    await prisma.galleryItem.deleteMany({
      where: {
        id: { in: ids }
      }
    });

    return NextResponse.json({ success: true, count: ids.length });
  } catch (error) {
    console.error("Failed to batch delete gallery items:", error);
    return NextResponse.json({ error: "Failed to batch delete gallery items" }, { status: 500 });
  }
}
