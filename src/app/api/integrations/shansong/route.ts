import { NextRequest, NextResponse } from "next/server";
import { encrypt, getAuthorizedUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  buildShansongAuthorizationUrl,
  cancelShansongAuthorization,
  getShansongConnectionStatus,
  getShansongRedirectUri,
} from "@/lib/shansong";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) return NextResponse.json({ error: "Permission denied" }, { status: 403 });

  try {
    const status = await getShansongConnectionStatus(session.id);
    let authUrl: string | null = null;
    let redirectUri: string | null = null;
    if (status.appConfigured) {
      redirectUri = getShansongRedirectUri(request.nextUrl.origin);
      const boundShopId = String(request.nextUrl.searchParams.get("shopId") || "").trim();
      if (boundShopId) {
        const shop = await prisma.shop.findFirst({ where: { id: boundShopId, userId: session.id }, select: { id: true } });
        if (!shop) return NextResponse.json({ error: "所选门店不存在或不属于当前账号" }, { status: 404 });
        const state = await encrypt({
          purpose: "shansong-merchant-auth",
          shansongUserId: session.id,
          shansongBoundShopId: shop.id,
        });
        authUrl = buildShansongAuthorizationUrl({ state, redirectUri });
      }
    }
    return NextResponse.json({ ...status, authUrl, redirectUri });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "读取闪送授权状态失败",
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) return NextResponse.json({ error: "Permission denied" }, { status: 403 });

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const boundShopId = String(body.shopId || "").trim();
    if (!boundShopId) return NextResponse.json({ error: "请选择要解除授权的门店" }, { status: 400 });
    await cancelShansongAuthorization(session.id, boundShopId);
    return NextResponse.json({ authorized: false, boundShopId });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "取消闪送授权失败",
    }, { status: 502 });
  }
}
