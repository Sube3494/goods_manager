import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Check if user exists and is admin
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
        // Option: Auto-create first user as admin if no users exist?
        // For now, let's stick to secure default: only allow existing users
        // OR for the sake of this demo/setup, allow creating the *first* user as admin.
        const userCount = await prisma.user.count();
        if (userCount === 0) {
            await prisma.user.create({
                data: { email, role: 'admin' }
            });
        } else {
             return NextResponse.json({ error: "User unauthorized" }, { status: 401 });
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
