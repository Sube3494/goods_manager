import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { SessionUser } from "@/lib/permissions";

/**
 * GET /api/admin/whitelist - List all whitelisted emails (SUPER_ADMIN only)
 */
export async function GET() {
  const session = await getFreshSession() as SessionUser | null;
  
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden: Super Admin only" }, { status: 403 });
  }

  try {
    const whitelist = await prisma.emailWhitelist.findMany({
      orderBy: { createdAt: "desc" }
    });

    const users = await prisma.user.findMany({
        where: { role: { not: "SUPER_ADMIN" } },
        select: {
            id: true,
            email: true,
            name: true,
            role: true,
            status: true,
            permissions: true,
            workspaceId: true
        }
    });

    // Join data in-memory
    const combined = whitelist.map(entry => ({
        ...entry,
        user: users.find(u => u.email === entry.email) || null
    }));

    return NextResponse.json(combined);
  } catch {
    return NextResponse.json({ error: "Failed to fetch whitelist" }, { status: 500 });
  }
}

/**
 * POST /api/admin/whitelist - Add to whitelist
 */
export async function POST(request: Request) {
  const session = await getFreshSession() as SessionUser | null;
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { email, role, permissions, targetWorkspaceId } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const entry = await prisma.emailWhitelist.upsert({
      where: { email },
      update: {
        role: role || "USER",
        permissions: permissions || {},
        targetWorkspaceId: targetWorkspaceId || null,
      },
      create: {
        email,
        role: role || "USER",
        permissions: permissions || {},
        targetWorkspaceId: targetWorkspaceId || null,
      },
    });

    return NextResponse.json(entry);
  } catch {
    return NextResponse.json({ error: "Failed to update whitelist" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/whitelist?email=...
 */
export async function DELETE(request: Request) {
  const session = await getFreshSession() as SessionUser | null;
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    const deleteUser = searchParams.get("deleteUser") === "true";

    if (!email) {
       return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Transaction to ensure consistency
    await prisma.$transaction(async (tx) => {
        // 1. Delete whitelist entry
        await tx.emailWhitelist.delete({
            where: { email }
        });

        // 2. Optional: Delete user account
        if (deleteUser) {
            const user = await tx.user.findUnique({ where: { email } });
            if (user) {
                // Determine what to do with workspace. 
                // For now, let's assume we delete the user. 
                // If they own a workspace, we might need to delete it or transfer ownership.
                // The schema `User` has `ownedWorkspace Workspace?`.
                // If we delete user, `Workspace` might break if not handled?
                // `Workspace` has `owner User @relation(...)`. 
                // We should probably delete the workspace too if they are the owner.
                
                // Let's rely on Cascade delete if configured, or delete explicitly.
                // Schema:
                // model Workspace { ownerId String @unique ... owner User ... }
                // No OnDelete Action on Workspace.owner.
                // So we must delete Workspace first if this user owns one.
                
                if (user.workspaceId) {
                     // Check if they are owner
                     const ownedWorkspace = await tx.workspace.findUnique({
                         where: { ownerId: user.id }
                     });
                     
                     if (ownedWorkspace) {
                         // Delete workspace (Cascade will handle items)
                         // But we need to make sure we don't leave orphans if Cascade isn't set everywhere.
                         // For simplicity in this iteration:
                         await tx.workspace.delete({
                             where: { id: ownedWorkspace.id }
                         });
                     }
                }
                
                await tx.user.delete({
                    where: { email }
                });
            }
        }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete failed:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
