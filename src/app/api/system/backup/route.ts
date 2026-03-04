import { NextResponse } from "next/server";
import { BackupService } from "@/lib/backup-service";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";

export const dynamic = 'force-dynamic';

/**
 * 获取备份列表
 */
export async function GET() {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !hasPermission(session, "system:manage")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const backups = await BackupService.listBackups();
    return NextResponse.json(backups);
  } catch (error) {
    console.error("Failed to list backups:", error);
    return NextResponse.json({ error: "获取备份列表失败" }, { status: 500 });
  }
}

/**
 * 立即执行一次备份
 */
export async function POST() {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !hasPermission(session, "system:manage")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await BackupService.createBackup();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Manual backup failed:", error);
    return NextResponse.json({ error: "备份执行失败" }, { status: 500 });
  }
}

/**
 * 删除备份
 */
export async function DELETE(request: Request) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !hasPermission(session, "system:manage")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const fileName = searchParams.get("fileName");
    
    if (!fileName) {
      return NextResponse.json({ error: "Missing fileName" }, { status: 400 });
    }

    await BackupService.deleteBackup(fileName);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete backup:", error);
    return NextResponse.json({ error: "删除备份失败" }, { status: 500 });
  }
}
