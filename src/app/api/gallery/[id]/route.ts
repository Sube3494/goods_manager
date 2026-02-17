import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "gallery:upload")) { // Use same permission as upload for now
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { isPublic } = body;

    const updated = await prisma.galleryItem.update({
      where: { id },
      data: { isPublic },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update gallery item:", error);
    return NextResponse.json({ error: "Failed to update gallery item" }, { status: 500 });
  }
}
