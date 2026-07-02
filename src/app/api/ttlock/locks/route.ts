import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { listTTLocksByUserId } from "@/lib/ttlock";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";

function generateScanUnlockToken(lockId: number) {
  const salt = process.env.SCAN_UNLOCK_SALT || "ttlock_scan_unlock_super_secret_salt_2026";
  return createHash("md5").update(`${lockId}_${salt}`).digest("hex").toLowerCase();
}

export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser("settings:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const lockAlias = String(searchParams.get("lockAlias") || "").trim();
    const pageNo = Number(searchParams.get("pageNo") || 1);
    const pageSize = Number(searchParams.get("pageSize") || 100);
    const result = await listTTLocksByUserId(session.id, { lockAlias, pageNo, pageSize });

    if (result && Array.isArray(result.locks)) {
      result.locks = result.locks.map((lock) => ({
        ...lock,
        scanUnlockToken: generateScanUnlockToken(lock.lockId),
      }));
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to load TTLock locks:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to load TTLock locks",
    }, { status: 500 });
  }
}
