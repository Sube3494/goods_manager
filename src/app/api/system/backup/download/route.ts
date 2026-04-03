import { NextResponse } from "next/server";
import { BackupService } from "@/lib/backup-service";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { stat } from "fs/promises";
import { createReadStream, existsSync } from "fs";
import { Readable } from "stream";

function buildContentDisposition(fileName: string) {
  const safeFileName = fileName.replace(/["\r\n]/g, "_");
  const encodedFileName = encodeURIComponent(fileName);
  return `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`;
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
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

    const filePath = BackupService.getBackupPath(fileName);
    if (!existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const fileStat = await stat(filePath);
    
    return new Response(Readable.toWeb(createReadStream(filePath)) as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(fileStat.size),
        'Content-Disposition': buildContentDisposition(fileName),
      }
    });
  } catch (error) {
    console.error("Download backup failed:", error);
    return NextResponse.json({ error: "下载失败" }, { status: 500 });
  }
}
