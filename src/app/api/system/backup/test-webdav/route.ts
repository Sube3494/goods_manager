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

    const { url, user, password } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const result = await BackupService.testWebDAVConnection(url, user, password);
    
    if (result.success) {
      return NextResponse.json({ message: "连接测试成功" });
    } else {
      return NextResponse.json({ error: result.error || "连接测试失败" }, { status: 500 });
    }
  } catch (error) {
    console.error("WebDAV connection test failed:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
