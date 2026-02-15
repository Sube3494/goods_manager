import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
        // Safe setup: allow the first user to be created as SUPER_ADMIN
        const userCount = await prisma.user.count();
        if (userCount === 0) {
            await prisma.$transaction(async (tx) => {
                const newUser = await tx.user.create({
                    data: { 
                      email, 
                      role: 'SUPER_ADMIN',
                      permissions: { all: true }
                    }
                });

                const workspace = await tx.workspace.create({
                    data: {
                        name: `${newUser.email}'s Workspace`,
                        ownerId: newUser.id,
                    }
                });

                await tx.user.update({
                    where: { id: newUser.id },
                    data: { workspaceId: workspace.id }
                });
            });
        } else {
            // Check whitelist for new users
            const whitelisted = await prisma.emailWhitelist.findUnique({
                where: { email }
            });

            if (!whitelisted) {
                return NextResponse.json({ error: "Email not in whitelist" }, { status: 401 });
            }
            // User doesn't exist yet but is whitelisted, we'll create it during login/verification
        }
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Store code
    await prisma.verificationCode.create({
      data: {
        email,
        code,
        expires,
      },
    });

    // Send email
    const sent = await sendVerificationEmail(email, code);

    if (!sent) {
      return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to send code:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
