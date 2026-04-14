import { NextResponse } from "next/server";
import { initFIFOData } from "@/lib/fifo-init";
import { getAuthorizedUser } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getAuthorizedUser("settings:manage");
    if (!session) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await initFIFOData();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Initialization failed:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
