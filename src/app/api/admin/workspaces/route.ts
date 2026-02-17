import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { SessionUser } from "@/lib/permissions";

/**
 * GET /api/admin/workspaces - List all workspaces (SUPER_ADMIN only)
 */
export async function GET() {
  const session = await getFreshSession() as SessionUser | null;
  
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden: Super Admin only" }, { status: 403 });
  }

  try {
    const workspaces = await prisma.workspace.findMany({
      select: {
        id: true,
        name: true,
        owner: {
           select: {
               email: true,
               name: true
           }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json(workspaces);
  } catch (error) {
    console.error("Failed to fetch workspaces:", error);
    return NextResponse.json({ error: "Failed to fetch workspaces" }, { status: 500 });
  }
}
