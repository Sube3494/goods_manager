import { NextRequest, NextResponse } from "next/server";
import { unlockTTLockByUserId, findAuthorizedTTLockUserId } from "@/lib/ttlock";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";

function generateScanUnlockToken(lockId: number) {
  const salt = process.env.SCAN_UNLOCK_SALT || "ttlock_scan_unlock_super_secret_salt_2026";
  return createHash("md5").update(`${lockId}_${salt}`).digest("hex").toLowerCase();
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ lockId: string }> }
) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token") || "";

  try {
    const params = await context.params;
    const lockId = Number(params.lockId);
    if (!Number.isFinite(lockId) || lockId <= 0) {
      return NextResponse.json({ error: "Invalid lock id" }, { status: 400 });
    }

    // Verify token
    const expectedToken = generateScanUnlockToken(lockId);
    if (!token || token.toLowerCase() !== expectedToken) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 });
    }

    const userId = await findAuthorizedTTLockUserId();
    if (!userId) {
      return NextResponse.json({ error: "No authorized TTLock configuration found" }, { status: 404 });
    }

    const result = await unlockTTLockByUserId(userId, lockId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to perform public TTLock unlock:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to perform public TTLock unlock",
    }, { status: 500 });
  }
}
