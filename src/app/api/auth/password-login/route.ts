import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { login } from "@/lib/auth";
import { verifyPassword } from "@/lib/passwordAuth";

export async function POST(request: Request) {
  try {
    const { email: rawEmail, password } = await request.json();
    const email = String(rawEmail || "").toLowerCase().trim();

    if (!email || !password) {
      return NextResponse.json({ error: "邮箱和密码不能为空" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { roleProfile: true },
    });

    if (!user) {
      return NextResponse.json({ error: "账号不存在或密码错误" }, { status: 400 });
    }

    if (user.status === "DISABLED") {
      return NextResponse.json({ error: "您的账号已被禁用" }, { status: 403 });
    }

    const requiresPasswordSetup = !user.passwordHash && !user.passwordSetAt;

    if (requiresPasswordSetup) {
      return NextResponse.json({
        error: "该账号尚未设置密码，请先使用邮箱验证码登录并完成首次设密",
        requiresPasswordSetup: true,
      }, { status: 400 });
    }

    if (!user.passwordHash) {
      return NextResponse.json({
        error: "当前账号密码状态异常，请先使用邮箱验证码登录",
      }, { status: 400 });
    }

    if (!verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: "账号不存在或密码错误" }, { status: 400 });
    }

    await login({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      roleProfile: user.roleProfile,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Password login failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
