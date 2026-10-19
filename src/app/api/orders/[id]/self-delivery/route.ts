import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { executeOrderSelfDelivery } from "@/lib/executeOrderSelfDelivery";

export const dynamic = "force-dynamic";

export async function POST(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  const { id } = await context.params;
  return executeOrderSelfDelivery(id, session);
}
