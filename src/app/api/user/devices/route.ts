import { NextResponse } from "next/server";
import { getFreshSession, getOnlineDeviceCutoff } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { SessionUser } from "@/lib/permissions";

type DeviceSessionUser = SessionUser & { sessionId?: string };

async function getCurrentUser() {
  return await getFreshSession() as DeviceSessionUser | null;
}

export async function GET() {
  try {
    const session = await getCurrentUser();
    if (!session?.id || !session.sessionId) {
      return NextResponse.json({ error: "登录状态无效" }, { status: 401 });
    }

    const [deviceSessions, settings] = await Promise.all([
      prisma.userDeviceSession.findMany({
        where: { userId: session.id, endedAt: null },
        orderBy: { lastSeenAt: "desc" },
        select: {
          id: true,
          sessionId: true,
          deviceType: true,
          deviceLabel: true,
          browser: true,
          os: true,
          ipAddress: true,
          createdAt: true,
          lastSeenAt: true,
        },
      }),
      prisma.systemSetting.findUnique({
        where: { id: "system" },
        select: { maxLoginDevices: true },
      }),
    ]);

    const onlineCutoff = getOnlineDeviceCutoff().getTime();
    const devices = deviceSessions
      .map(({ sessionId, ...device }) => ({
        ...device,
        isCurrent: sessionId === session.sessionId,
        isOnline: device.lastSeenAt.getTime() >= onlineCutoff,
      }))
      .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));

    return NextResponse.json({
      devices,
      maxLoginDevices: Math.max(1, settings?.maxLoginDevices ?? 2),
    });
  } catch (error) {
    console.error("Failed to load user devices:", error);
    return NextResponse.json({ error: "加载登录设备失败" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getCurrentUser();
    if (!session?.id || !session.sessionId) {
      return NextResponse.json({ error: "登录状态无效" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const deviceId = typeof body?.deviceId === "string" ? body.deviceId : null;
    const allOthers = body?.allOthers === true;

    if (!deviceId && !allOthers) {
      return NextResponse.json({ error: "请选择需要退出的设备" }, { status: 400 });
    }

    const result = await prisma.userDeviceSession.updateMany({
      where: {
        userId: session.id,
        endedAt: null,
        sessionId: { not: session.sessionId },
        ...(allOthers ? {} : { id: deviceId! }),
      },
      data: { endedAt: new Date() },
    });

    if (!allOthers && result.count === 0) {
      return NextResponse.json({ error: "设备不存在、已退出或为当前设备" }, { status: 404 });
    }

    return NextResponse.json({ success: true, count: result.count });
  } catch (error) {
    console.error("Failed to revoke user device:", error);
    return NextResponse.json({ error: "退出设备失败" }, { status: 500 });
  }
}
