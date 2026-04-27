import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { AUTO_PICK_ALLOWED_STATUSES, backfillPersistedAutoPickOrderFields, syncAutoPickOrdersFromPlugin } from "@/lib/autoPickOrders";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const mode = String(body?.mode || "status");
    const status = String(body?.status || "confirm");
    const date = String(body?.date || "").trim();

    if (mode === "backfill") {
      const result = await backfillPersistedAutoPickOrderFields(session.id);
      return NextResponse.json({
        ok: true,
        mode,
        backfilled: result.count,
      });
    }

    if (mode === "date") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
      }

      const result = await syncAutoPickOrdersFromPlugin(session.id, { date });
      const backfill = await backfillPersistedAutoPickOrderFields(session.id);
      return NextResponse.json({
        ok: true,
        mode,
        synced: result.count,
        skipped: result.skipped || 0,
        skippedOrders: result.skippedOrders || [],
        backfilled: backfill.count,
      });
    }

    if (!AUTO_PICK_ALLOWED_STATUSES.includes(status as typeof AUTO_PICK_ALLOWED_STATUSES[number])) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }

    const result = await syncAutoPickOrdersFromPlugin(session.id, { status: status as typeof AUTO_PICK_ALLOWED_STATUSES[number] });
    const backfill = await backfillPersistedAutoPickOrderFields(session.id);
    return NextResponse.json({
      ok: true,
      mode,
      synced: result.count,
      skipped: result.skipped || 0,
      skippedOrders: result.skippedOrders || [],
      backfilled: backfill.count,
      status,
    });
  } catch (error) {
    console.error("Failed to sync auto-pick orders:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to sync orders",
    }, { status: 500 });
  }
}
