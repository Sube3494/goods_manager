import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { hashPassword, validatePassword, verifyPassword } from "@/lib/passwordAuth";

export async function POST(request: Request) {
  try {
    const session = await getAuthorizedUser();
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { currentPassword, newPassword, confirmPassword } = await request.json();

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json({ error: "请完整填写密码信息" }, { status: 400 });
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: "两次输入的新密码不一致" }, { status: 400 });
    }

    const passwordError = validatePassword(String(newPassword));
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { id: true, status: true, passwordHash: true },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    if (user.status === "DISABLED") {
      return NextResponse.json({ error: "您的账号已被禁用" }, { status: 403 });
    }

    if (!user.passwordHash) {
      return NextResponse.json({ error: "当前账号尚未设置密码，请先使用验证码完成首次设密" }, { status: 400 });
    }

    if (!verifyPassword(String(currentPassword), user.passwordHash)) {
      return NextResponse.json({ error: "当前密码不正确" }, { status: 400 });
    }

    if (verifyPassword(String(newPassword), user.passwordHash)) {
      return NextResponse.json({ error: "新密码不能与当前密码相同" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashPassword(String(newPassword)),
        passwordSetAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Change password failed:", error);
    return NextResponse.json({ error: "修改密码失败，请稍后重试" }, { status: 500 });
  }
}
