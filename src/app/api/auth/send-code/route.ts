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

    if (user && user.status === 'DISABLED') {
        return NextResponse.json({ error: "账户已被禁用，无法发送验证码" }, { status: 403 });
    }

    if (!user) {
        // 1. Initial Admin setup via Environment Variable (Safest)
        const initialAdmin = process.env.INITIAL_ADMIN_EMAIL;
        const superAdminExists = await prisma.user.findFirst({
            where: { role: 'SUPER_ADMIN' }
        });

        if (initialAdmin && email === initialAdmin && !superAdminExists) {
            // Allow this specific user to be authorized
            console.log(`Initial admin ${email} authorized via ENV block.`);
        } else {
            // 2. Check traditional whitelist
            const whitelisted = await prisma.emailWhitelist.findUnique({
                where: { email }
            });

            // 3. Check active invitations
            const invitation = await prisma.invitation.findFirst({
                where: { 
                    email,
                    usedAt: null,
                    expiresAt: { gt: new Date() }
                }
            });

            if (!whitelisted && !invitation) {
                return NextResponse.json({ 
                    error: "邮箱未在白名单或邀请列表中", 
                    allowRequest: true // Hint for frontend to show "Apply for access" button
                }, { status: 401 });
            }
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
