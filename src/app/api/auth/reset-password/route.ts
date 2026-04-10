import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { login } from "@/lib/auth";
import { hashPassword, validatePassword, verifyPasswordResetToken } from "@/lib/passwordAuth";

export async function POST(request: Request) {
  try {
    const { token, password, confirmPassword } = await request.json();

    if (!token || !password || !confirmPassword) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    if (password !== confirmPassword) {
      return NextResponse.json({ error: "两次输入的密码不一致" }, { status: 400 });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const payload = await verifyPasswordResetToken(String(token));
    if (!payload.userId || !payload.email) {
      return NextResponse.json({ error: "重置凭证无效" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { roleProfile: true },
    });

    if (!user || user.email.toLowerCase() !== payload.email) {
      return NextResponse.json({ error: "用户不存在或凭证无效" }, { status: 400 });
    }

    if (user.status === "DISABLED") {
      return NextResponse.json({ error: "当前操作暂时无法完成，请联系管理员" }, { status: 403 });
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashPassword(String(password)),
        passwordSetAt: new Date(),
      },
      include: { roleProfile: true },
    });

    await login({
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      role: updatedUser.role,
      roleProfile: updatedUser.roleProfile,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reset password failed:", error);
    return NextResponse.json({ error: "重置链接无效或已过期，请重新获取验证码" }, { status: 400 });
  }
}
