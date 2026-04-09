import { NextResponse } from "next/server";
import { BackupService } from "@/lib/backup-service";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";

export async function POST(request: Request) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !hasPermission(session, "system:manage")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { fileName, password } = await request.json();
    if (!fileName) {
      return NextResponse.json({ error: "文件名必填" }, { status: 400 });
    }

    const result = await BackupService.restoreFromFile(fileName, password);
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("Server-side restore failed:", error);
    const message = error instanceof Error ? error.message : "恢复执行失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
