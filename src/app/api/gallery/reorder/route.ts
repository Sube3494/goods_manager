import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";

export async function POST(request: Request) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "gallery:upload")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { items } = await request.json();

    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: "Invalid payload format" }, { status: 400 });
    }

    // Wrap the updates in a transaction to ensure all or nothing
    await prisma.$transaction(
      items.map((item: { id: string; sortOrder: number }) =>
        prisma.galleryItem.update({
          where: { 
            id: item.id,
            workspaceId: session.workspaceId 
          },
          data: { sortOrder: item.sortOrder },
        })
      )
    );

    return NextResponse.json({ success: true, count: items.length });
  } catch (error) {
    console.error("Failed to reorder gallery items:", error);
    return NextResponse.json({ error: "Failed to reorder items" }, { status: 500 });
  }
}
