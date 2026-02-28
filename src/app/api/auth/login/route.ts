import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { login } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const { email, code } = await request.json();

    if (!email || !code) {
      return NextResponse.json({ error: "Email and code are required" }, { status: 400 });
    }

    // Find valid code
    const verification = await prisma.verificationCode.findFirst({
      where: {
        email,
        code,
        expires: {
          gt: new Date(),
        },
      },
    });

    if (!verification) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
    }

    // Find user
    let user = await prisma.user.findUnique({
      where: { email },
      include: { workspace: true }
    });

    if (!user) {
        // User doesn't exist? Check authorization sources
        const initialAdminEmail = process.env.INITIAL_ADMIN_EMAIL;
        const superAdminExists = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
        
        const whitelisted = await prisma.emailWhitelist.findUnique({ where: { email } });
        const invitation = await prisma.invitation.findFirst({
            where: { 
                email,
                usedAt: null,
                expiresAt: { gt: new Date() }
            }
        });

        const isInitialAdmin = initialAdminEmail && email === initialAdminEmail && !superAdminExists;

        if (!isInitialAdmin && !whitelisted && !invitation) {
            return NextResponse.json({ error: "Unauthorized registration" }, { status: 401 });
        }

        // Determine initial role and permissions
        let role: any = "USER";
        let permissions: any = {};
        let targetWorkspaceId = undefined;

        if (isInitialAdmin) {
            role = "SUPER_ADMIN";
            permissions = { all: true };
        } else if (invitation) {
            role = invitation.role;
            permissions = invitation.permissions || {};
            targetWorkspaceId = invitation.targetWorkspaceId || undefined;
        } else if (whitelisted) {
            role = whitelisted.role;
            permissions = whitelisted.permissions || {};
            targetWorkspaceId = whitelisted.targetWorkspaceId || undefined;
        }

        // Create user and their workspace
        user = await prisma.$transaction(async (tx) => {
            const newUser = await tx.user.create({
                data: {
                    email,
                    role,
                    permissions,
                    workspaceId: targetWorkspaceId
                }
            });

            // If no target workspace, create a new one
            if (!targetWorkspaceId) {
                const workspace = await tx.workspace.create({
                    data: {
                        name: `${newUser.email}'s Workspace`,
                        ownerId: newUser.id,
                    }
                });

                // Update user with workspaceId
                return await tx.user.update({
                    where: { id: newUser.id },
                    data: { workspaceId: workspace.id },
                    include: { workspace: true }
                });
            }

            // If joined existing workspace, return user with included workspace
            return await tx.user.findUnique({
                where: { id: newUser.id },
                include: { workspace: true }
            });
        });

        // Mark invitation as used if applicable
        if (invitation) {
            await prisma.invitation.update({
                where: { id: invitation.id },
                data: { usedAt: new Date() }
            });
        }
    }


    // Ensure every user has a workspace (Fix for legacy or improperly initialized accounts)
    if (user && !user.workspaceId) {
        console.log(`User ${user.email} missing workspaceId, creating default...`);
        user = await prisma.$transaction(async (tx) => {
            const workspace = await tx.workspace.create({
                data: {
                    name: `${user!.email}'s Workspace`,
                    ownerId: user!.id,
                }
            });

            return await tx.user.update({
                where: { id: user!.id },
                data: { workspaceId: workspace.id },
                include: { workspace: true }
            });
        });
    }

    if (!user) {
        return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
    }

    if (user.status === "DISABLED") {
        return NextResponse.json({ error: "Your account is disabled" }, { status: 403 });
    }

    // Login (create session)
    await login({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        workspaceId: user.workspaceId || ""
    });

    // Delete used code
    await prisma.verificationCode.delete({
      where: { id: verification.id },
    });

    // Also clean up old codes for this email
    await prisma.verificationCode.deleteMany({
        where: { email }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Login verification failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
