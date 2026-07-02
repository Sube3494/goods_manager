import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { unlockTTLockByUserId } from "@/lib/ttlock";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ lockId: string }> }
) {
  const session = await getAuthorizedUser("settings:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const params = await context.params;
    const lockId = Number(params.lockId);
    if (!Number.isFinite(lockId) || lockId <= 0) {
      return NextResponse.json({ error: "Invalid lock id" }, { status: 400 });
    }

    const result = await unlockTTLockByUserId(session.id, lockId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to unlock TTLock lock:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to unlock TTLock lock",
    }, { status: 500 });
  }
}
