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
        // Since we check whitelist in send-code, if we are here, user MUST be whitelisted
        const whitelisted = await prisma.emailWhitelist.findUnique({
            where: { email }
        });

        if (!whitelisted) {
            return NextResponse.json({ error: "Unauthorized registration" }, { status: 401 });
        }

        // Create user and their workspace
        user = await prisma.$transaction(async (tx) => {
            const newUser = await tx.user.create({
                data: {
                    email: whitelisted.email,
                    role: whitelisted.role,
                    permissions: whitelisted.permissions || {},
                }
            });

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
        });
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
