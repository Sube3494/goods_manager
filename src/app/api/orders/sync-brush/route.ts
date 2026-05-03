import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { syncBrushOrderFromCompletedAutoPickOrder } from "@/lib/autoPickOrders";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const targets = Array.isArray(body?.orders)
      ? body.orders
      : Array.isArray(body?.ids)
        ? body.ids.map((id: unknown) => ({ id }))
        : [];
    const normalizedTargets: Array<{ id: string; matchedShopName: string | null }> = targets
      .map((item: unknown) => {
        if (typeof item === "string") {
          return { id: item.trim(), matchedShopName: null };
        }
        if (item && typeof item === "object") {
          return {
            id: String((item as { id?: unknown }).id || "").trim(),
            matchedShopName: String((item as { matchedShopName?: unknown }).matchedShopName || "").trim() || null,
          };
        }
        return { id: "", matchedShopName: null };
      })
      .filter((item: { id: string; matchedShopName: string | null }) => item.id);

    if (normalizedTargets.length === 0) {
      return NextResponse.json({ error: "没有可同步的订单" }, { status: 400 });
    }

    let synced = 0;
    let updated = 0;
    let skipped = 0;
    const skippedOrders: Array<{ id: string; reason: string }> = [];
    for (const target of normalizedTargets) {
      const result = await syncBrushOrderFromCompletedAutoPickOrder(session.id, target.id, {
        allowSelfDeliveryFallback: true,
        fallbackOnly: true,
        forceInclude: true,
        preferredMappedShopName: target.matchedShopName,
        overwriteExisting: true,
      }).catch((error) => ({
        ok: false as const,
        skipped: true as const,
        reason: error instanceof Error ? error.message : "sync-error",
      }));

      if (result.ok) {
        if ("updated" in result && result.updated) {
          updated += 1;
        } else if ("duplicated" in result && result.duplicated) {
          updated += 1;
        } else {
          synced += 1;
        }
        continue;
      }

      skipped += 1;
      skippedOrders.push({
        id: target.id,
        reason: String(result.reason || "skipped"),
      });
    }

    return NextResponse.json({
      ok: true,
      synced,
      updated,
      skipped,
      skippedOrders,
    });
  } catch (error) {
    console.error("Failed to sync brush orders in bulk:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to sync brush orders",
    }, { status: 500 });
  }
}
