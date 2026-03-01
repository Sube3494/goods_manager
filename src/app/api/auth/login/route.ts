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
      include: { roleProfile: true }
    });

    if (!user) {
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

        let role: "USER" | "SUPER_ADMIN" = "USER";
        let roleProfileId: string | null = null;
        
        // Determine initial role and permissions
        if (isInitialAdmin) {
            role = "SUPER_ADMIN";
        } else if (invitation) {
            role = "USER";
            roleProfileId = invitation.roleProfileId;
        } else if (whitelisted) {
            role = "USER";
            roleProfileId = whitelisted.roleProfileId;
        }

        // Create user
        user = await prisma.user.create({
            data: {
                email,
                role,
                roleProfileId,
            },
            include: { roleProfile: true }
        });

        // Mark invitation as used if applicable
        if (invitation) {
            await prisma.invitation.update({
                where: { id: invitation.id },
                data: { usedAt: new Date() }
            });
        }
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
