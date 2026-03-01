import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { SessionUser } from "@/lib/permissions";

/**
 * GET /api/admin/whitelist - List all whitelisted emails and invitations (SUPER_ADMIN only)
 */
export async function GET() {
  const session = await getFreshSession() as SessionUser | null;
  
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden: Super Admin only" }, { status: 403 });
  }

  try {
    const whitelist = await prisma.emailWhitelist.findMany({
      orderBy: { createdAt: "desc" },
      include: { roleProfile: true }
    });

    const invitations = await prisma.invitation.findMany({
        where: { usedAt: null, expiresAt: { gt: new Date() } }
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
            roleProfile: true
        }
    });

    // Join data in-memory
    const combined = whitelist.map(entry => {
        const invitation = invitations.find(i => i.email === entry.email);
        return {
            ...entry,
            invitationToken: invitation?.token || null,
            invitationExpiresAt: invitation?.expiresAt || null,
            user: users.find(u => u.email === entry.email) || null
        };
    });

    return NextResponse.json(combined);
  } catch (error) {
    console.error("Failed to fetch whitelist:", error);
    return NextResponse.json({ error: "Failed to fetch whitelist" }, { status: 500 });
  }
}

/**
 * POST /api/admin/whitelist - Add to whitelist and create Invitation
 */
export async function POST(request: Request) {
  const session = await getFreshSession() as SessionUser | null;
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { email, roleProfileId } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Use transaction to create both whitelist entry and an invitation token
    const result = await prisma.$transaction(async (tx) => {
        const entry = await tx.emailWhitelist.upsert({
            where: { email },
            update: {
                roleProfileId: roleProfileId || null,
            },
            create: {
                email,
                roleProfileId: roleProfileId || null,
            },
        });

        // Create or refresh an Invitation
        await tx.invitation.deleteMany({
            where: { email, usedAt: null }
        });

        const invitation = await tx.invitation.create({
            data: {
                email,
                roleProfileId: roleProfileId || null,
                inviterId: session.id,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            }
        });

        return { ...entry, invitationToken: invitation.token };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to update whitelist and invitation:", error);
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
            await tx.user.delete({
                where: { email }
            });
        }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete failed:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
