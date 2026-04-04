import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createPasswordResetToken } from "@/lib/passwordAuth";

export async function POST(request: Request) {
  try {
    const { email: rawEmail, code } = await request.json();
    const email = String(rawEmail || "").toLowerCase().trim();

    if (!email || !code) {
      return NextResponse.json({ error: "Email and code are required" }, { status: 400 });
    }

    const verification = await prisma.verificationCode.findFirst({
      where: {
        email,
        code,
        expires: { gt: new Date() },
      },
    });

    if (!verification) {
      return NextResponse.json({ error: "验证码无效或已过期" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json({ error: "该邮箱未注册账号" }, { status: 404 });
    }

    if (user.status === "DISABLED") {
      return NextResponse.json({ error: "您的账号已被禁用" }, { status: 403 });
    }

    await prisma.verificationCode.delete({
      where: { id: verification.id },
    });

    await prisma.verificationCode.deleteMany({
      where: { email },
    });

    const resetToken = await createPasswordResetToken({
      userId: user.id,
      email: user.email,
    });

    return NextResponse.json({
      success: true,
      resetToken,
    });
  } catch (error) {
    console.error("Forgot-password code verification failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
