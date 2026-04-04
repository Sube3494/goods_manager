import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const { email: rawEmail } = await request.json();
    const email = String(rawEmail || "").toLowerCase().trim();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json({ error: "该邮箱未注册账号" }, { status: 404 });
    }

    if (user.status === "DISABLED") {
      return NextResponse.json({ error: "账户已被禁用，无法重置密码" }, { status: 403 });
    }

    const lastCode = await prisma.verificationCode.findFirst({
      where: { email },
      orderBy: { createdAt: "desc" },
    });

    if (lastCode) {
      const diff = Date.now() - lastCode.createdAt.getTime();
      if (diff < 60 * 1000) {
        const remaining = Math.ceil((60 * 1000 - diff) / 1000);
        return NextResponse.json(
          { error: `发送过于频繁，请在 ${remaining} 秒后重试` },
          { status: 429 }
        );
      }
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 5 * 60 * 1000);

    await prisma.verificationCode.create({
      data: {
        email,
        code,
        expires,
      },
    });

    const sent = await sendVerificationEmail(email, code, "reset-password");
    if (!sent) {
      return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to send forgot-password code:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
