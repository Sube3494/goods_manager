import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import {
  getPublicTTLockIntegrationConfigByUserId,
  updateTTLockIntegrationConfigByUserId,
} from "@/lib/ttlock";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAuthorizedUser("settings:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const config = await getPublicTTLockIntegrationConfigByUserId(session.id);
    return NextResponse.json(config);
  } catch (error) {
    console.error("Failed to load TTLock config:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to load TTLock config",
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser("settings:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    await updateTTLockIntegrationConfigByUserId(session.id, body);
    const publicConfig = await getPublicTTLockIntegrationConfigByUserId(session.id);
    return NextResponse.json(publicConfig);
  } catch (error) {
    console.error("Failed to save TTLock config:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to save TTLock config",
    }, { status: 500 });
  }
}
