import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { applyOfflineOrderAmountRepair, previewOfflineOrderAmountRepair } from "@/lib/offlineOrderRepairs";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const dryRun = body?.dryRun !== false;

    if (dryRun) {
      const candidates = await previewOfflineOrderAmountRepair(session.id);
      return NextResponse.json({
        ok: true,
        dryRun: true,
        candidateCount: candidates.length,
        candidates,
      });
    }

    const result = await applyOfflineOrderAmountRepair(session.id);
    return NextResponse.json({
      ok: true,
      dryRun: false,
      candidateCount: result.scannedCount,
      updatedCount: result.updatedCount,
      candidates: result.candidates,
    });
  } catch (error) {
    console.error("Failed to fix history offline order amounts:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Internal Server Error",
    }, { status: 500 });
  }
}
