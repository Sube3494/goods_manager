import { NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { processDueAutoCompleteJobs, scheduleNextAutoCompleteJob } from "@/lib/autoPickAutoComplete";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getAuthorizedUser("order:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  const result = await processDueAutoCompleteJobs();
  await scheduleNextAutoCompleteJob();
  if (result.processed > 0) {
    console.log(`[tick-auto-complete] processed=${result.processed} ok=${result.succeeded} fail=${result.failed}`);
  }
  return NextResponse.json(result);
}
