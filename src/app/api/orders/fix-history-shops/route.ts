import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { fixHistoryShopOrdersForUser } from "@/lib/autoPickOrders";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  console.log("POST /api/orders/fix-history-shops triggered, url:", request.url);
  const session = await getAuthorizedUser("order:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const updatedCount = await fixHistoryShopOrdersForUser(session.id);

    return NextResponse.json({
      ok: true,
      updatedCount,
    });

  } catch (error) {
    console.error("Failed to fix history shop orders:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Internal Server Error"
    }, { status: 500 });
  }
}
