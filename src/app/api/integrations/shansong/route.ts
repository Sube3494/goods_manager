import { NextRequest, NextResponse } from "next/server";
import { encrypt, getAuthorizedUser } from "@/lib/auth";
import {
  buildShansongAuthorizationUrl,
  bindShansongShop,
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
      const state = await encrypt({
        purpose: "shansong-merchant-auth",
        shansongUserId: session.id,
      });
      authUrl = buildShansongAuthorizationUrl({ state, redirectUri });
    }
    return NextResponse.json({ ...status, authUrl, redirectUri });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "读取闪送授权状态失败",
    }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) return NextResponse.json({ error: "Permission denied" }, { status: 403 });

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const shop = await bindShansongShop(session.id, String(body.shopId || ""));
    const status = await getShansongConnectionStatus(session.id);
    return NextResponse.json({ ...status, boundShopId: shop.id, boundShopName: shop.name });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "保存闪送门店绑定失败",
    }, { status: 400 });
  }
}

export async function DELETE() {
  const session = await getAuthorizedUser("order:manage");
  if (!session) return NextResponse.json({ error: "Permission denied" }, { status: 403 });

  try {
    await cancelShansongAuthorization(session.id);
    return NextResponse.json({ authorized: false });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "取消闪送授权失败",
    }, { status: 502 });
  }
}
