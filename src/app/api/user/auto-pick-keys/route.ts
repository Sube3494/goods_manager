import { NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { createAutoPickApiKeyForUser, listAutoPickApiKeys } from "@/lib/autoPickOrders";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAuthorizedUser("order:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const items = await listAutoPickApiKeys(session.id);
    return NextResponse.json({ items });
  } catch (error) {
    console.error("Failed to list auto-pick keys:", error);
    return NextResponse.json({ error: "Failed to load keys" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const label = String(body?.label || "").trim();

    if (!label) {
      return NextResponse.json({ error: "Label is required" }, { status: 400 });
    }

    const result = await createAutoPickApiKeyForUser(session.id, label);
    return NextResponse.json({
      item: result.record,
      apiKey: result.apiKey,
    }, { status: 201 });
  } catch (error) {
    console.error("Failed to create auto-pick key:", error);
    return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
  }
}
