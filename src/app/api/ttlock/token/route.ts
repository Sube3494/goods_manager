import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import {
  getPublicTTLockIntegrationConfigByUserId,
  issueTTLockAccessTokenByUserId,
  refreshTTLockAccessTokenByUserId,
} from "@/lib/ttlock";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser("settings:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const mode = String(body.mode || "authorize").trim().toLowerCase();
    const config = mode === "refresh"
      ? await refreshTTLockAccessTokenByUserId(session.id)
      : await issueTTLockAccessTokenByUserId(session.id);
    void config;
    const publicConfig = await getPublicTTLockIntegrationConfigByUserId(session.id);

    return NextResponse.json({
      success: true,
      config: publicConfig,
    });
  } catch (error) {
    console.error("Failed to refresh TTLock token:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to refresh TTLock token",
    }, { status: 500 });
  }
}
