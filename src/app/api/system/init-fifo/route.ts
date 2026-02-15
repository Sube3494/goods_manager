import { NextResponse } from "next/server";
import { initFIFOData } from "@/lib/fifo-init";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";

export async function GET() {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !hasPermission(session, "system:manage")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await initFIFOData();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Initialization failed:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
