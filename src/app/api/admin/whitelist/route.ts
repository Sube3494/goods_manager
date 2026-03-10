import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { SessionUser } from "@/lib/permissions";
import { sendInvitationEmail } from "@/lib/email";
import { getRequestOrigin } from "@/lib/utils";

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
        const entryEmail = entry.email.toLowerCase();
        const invitation = invitations.find(i => i.email.toLowerCase() === entryEmail);
        return {
            ...entry,
            invitationToken: invitation?.token || null,
            invitationExpiresAt: invitation?.expiresAt || null,
            user: users.find(u => u.email.toLowerCase() === entryEmail) || null
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
    const { email: rawEmail, roleProfileId } = await request.json();
    const email = rawEmail?.toLowerCase().trim();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Use transaction to create both whitelist entry and an invitation token
    const result = await prisma.$transaction(async (tx) => {
        // Find existing user first
        const existingUser = await tx.user.findUnique({
            where: { email },
            select: { status: true }
        });

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

        // If user is already registered and active, we don't need a new invitation token
        if (existingUser && existingUser.status === 'ACTIVE') {
            return { ...entry, alreadyActive: true };
        }

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

    // 只有非活跃用户才发送邮件通知
    const { alreadyActive, invitationToken } = result as { alreadyActive?: boolean; invitationToken?: string };

    if (!alreadyActive && invitationToken) {
        const origin = getRequestOrigin(request);
        const safeEmail = email || "";
        const encodedEmail = encodeURIComponent(safeEmail);
        const inviteUrl = `${origin}/login?email=${encodedEmail}&token=${invitationToken}`;
        
        sendInvitationEmail(email, inviteUrl).catch(err => {
            console.error("Failed to send invitation email background:", err);
        });
    }

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
    const rawEmail = searchParams.get("email");
    const email = rawEmail?.toLowerCase().trim();

    if (!email) {
       return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Transaction to ensure consistency
    await prisma.$transaction(async (tx) => {
        // 1. Delete whitelist entry
        await tx.emailWhitelist.delete({
            where: { email }
        }).catch(() => {
            console.log(`Whitelist entry for ${email} already gone or not found.`);
        });

        // 2. Delete invitations
        await tx.invitation.deleteMany({
            where: { email }
        });

        // 3. Always try to delete matching user account to ensure complete removal
        await tx.user.delete({
            where: { email }
        }).catch(() => {
            console.log(`User record for ${email} not found during revocation.`);
        });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete failed:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
