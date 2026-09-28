import { NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/auth";
import { exchangeShansongAuthorizationCode } from "@/lib/shansong";

export const dynamic = "force-dynamic";

function redirectWithResult(request: NextRequest, result: "connected" | "error", message?: string) {
  const url = new URL("/profile", request.nextUrl.origin);
  url.searchParams.set("shansong", result);
  if (message) url.searchParams.set("message", message.slice(0, 180));
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const code = String(request.nextUrl.searchParams.get("code") || "").trim();
  const state = String(request.nextUrl.searchParams.get("state") || "").trim();
  const shopId = String(request.nextUrl.searchParams.get("shopId") || "").trim();
  const isAllStoreAuth = request.nextUrl.searchParams.get("isAllStoreAuth") === "true";
  if (!code || !state) return redirectWithResult(request, "error", "闪送授权回调缺少 code 或 state");

  try {
    const payload = await decrypt(state);
    const issuedAt = Number(payload.iat || 0) * 1000;
    const userId = String(payload.shansongUserId || "").trim();
    if (payload.purpose !== "shansong-merchant-auth" || !userId) throw new Error("授权状态无效");
    if (!issuedAt || Date.now() - issuedAt > 10 * 60 * 1000) throw new Error("授权页面已超时，请重新发起授权");
    await exchangeShansongAuthorizationCode(userId, { code, shopId, isAllStoreAuth });
    return redirectWithResult(request, "connected");
  } catch (error) {
    return redirectWithResult(request, "error", error instanceof Error ? error.message : "闪送授权失败");
  }
}
