import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedAdmin, getAuthorizedAdminAny } from "@/lib/auth";
import { sendInvitationEmail } from "@/lib/email";
import { getRequestOrigin } from "@/lib/utils";

/**
 * GET /api/admin/whitelist - List all whitelisted emails and invitations
 */
export async function GET() {
  const session = await getAuthorizedAdminAny("whitelist:manage", "members:manage", "members:status");
  
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
  const session = await getAuthorizedAdmin("whitelist:manage");
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

    try {
    const { email: rawEmail, roleProfileId, remark } = await request.json();
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
                remark: remark !== undefined ? (String(remark).trim() || null) : undefined,
            },
            create: {
                email,
                roleProfileId: roleProfileId || null,
                remark: remark ? String(remark).trim() : null,
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

export async function PATCH(request: Request) {
  const session = await getAuthorizedAdminAny("whitelist:manage", "members:manage");
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { email: rawEmail, emails, roleProfileId, remark } = await request.json();
    const email = rawEmail?.toLowerCase().trim();
    const targetEmails = Array.from(new Set(
      [
        ...(email ? [email] : []),
        ...(Array.isArray(emails) ? emails : []),
      ]
        .map((item) => String(item || "").trim().toLowerCase())
        .filter(Boolean)
    ));

    if (targetEmails.length === 0) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    if (targetEmails.length === 1 && remark !== undefined && roleProfileId === undefined) {
      const updated = await prisma.emailWhitelist.update({
        where: { email: targetEmails[0] },
        data: {
          remark: String(remark).trim() || null,
        },
        include: {
          roleProfile: true,
        }
      });

      return NextResponse.json(updated);
    }

    await prisma.$transaction(async (tx) => {
      if (roleProfileId !== undefined || remark !== undefined) {
        await tx.emailWhitelist.updateMany({
          where: { email: { in: targetEmails } },
          data: {
            roleProfileId: roleProfileId !== undefined ? (roleProfileId || null) : undefined,
            remark: remark !== undefined ? (String(remark).trim() || null) : undefined,
          },
        });
      }

      if (roleProfileId !== undefined) {
        await tx.user.updateMany({
          where: { email: { in: targetEmails } },
          data: {
            roleProfileId: roleProfileId || null,
          },
        });
      }
    });

    return NextResponse.json({ success: true, count: targetEmails.length });
  } catch (error) {
    console.error("Failed to update whitelist entry:", error);
    return NextResponse.json({ error: "Failed to update whitelist entry" }, { status: 500 });
  }
}


/**
 * DELETE /api/admin/whitelist?email=...
 */
export async function DELETE(request: Request) {
  const session = await getAuthorizedAdmin("whitelist:manage");
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const rawEmail = searchParams.get("email");
    const email = rawEmail?.toLowerCase().trim();
    const body = request.headers.get("content-length") ? await request.json().catch(() => ({})) : {};
    const targetEmails = Array.from(new Set(
      [
        ...(email ? [email] : []),
        ...(Array.isArray((body as { emails?: unknown }).emails) ? (body as { emails: unknown[] }).emails : []),
      ]
        .map((item) => String(item || "").trim().toLowerCase())
        .filter(Boolean)
    ));

    if (targetEmails.length === 0) {
       return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Transaction to ensure consistency
    await prisma.$transaction(async (tx) => {
        // 1. Delete whitelist entry
        await tx.emailWhitelist.deleteMany({
            where: { email: { in: targetEmails } }
        });

        // 2. Delete invitations
        await tx.invitation.deleteMany({
            where: { email: { in: targetEmails } }
        });

        // 3. Always try to delete matching user account to ensure complete removal
        await tx.user.deleteMany({
            where: { email: { in: targetEmails } }
        });
    });

    return NextResponse.json({ success: true, count: targetEmails.length });
  } catch (error) {
    console.error("Delete failed:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
