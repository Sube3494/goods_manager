import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { revokeAutoPickApiKey } from "@/lib/autoPickOrders";

export const dynamic = "force-dynamic";

export async function DELETE(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const result = await revokeAutoPickApiKey(session.id, id);

    if (!result.count) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to revoke auto-pick key:", error);
    return NextResponse.json({ error: "Failed to revoke key" }, { status: 500 });
  }
}
