import { NextResponse } from "next/server";
import { initFIFOData } from "@/lib/fifo-init";

export async function GET() {
  try {
    const result = await initFIFOData();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Initialization failed:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
