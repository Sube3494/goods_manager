import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { getTTLockDetailByUserId } from "@/lib/ttlock";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";

function generateScanUnlockToken(lockId: number) {
  const salt = process.env.SCAN_UNLOCK_SALT || "ttlock_scan_unlock_super_secret_salt_2026";
  return createHash("md5").update(`${lockId}_${salt}`).digest("hex").toLowerCase();
}

export async function GET(
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

    const result = await getTTLockDetailByUserId(session.id, lockId);
    if (result && result.lock) {
      result.lock = {
        ...result.lock,
        scanUnlockToken: generateScanUnlockToken(lockId),
      };
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to load TTLock lock detail:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to load TTLock lock detail",
    }, { status: 500 });
  }
}
