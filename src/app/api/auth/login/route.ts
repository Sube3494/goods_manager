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
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
        // Should not happen if send-code logic is correct, but safe check
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Login (create session)
    await login({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
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
