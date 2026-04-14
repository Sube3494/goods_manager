import { NextResponse } from "next/server";
import { BackupService } from "@/lib/backup-service";
import { getAuthorizedUser } from "@/lib/auth";

function buildContentDisposition(fileName: string) {
  const safeFileName = fileName.replace(/["\r\n]/g, "_");
  const encodedFileName = encodeURIComponent(fileName);
  return `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`;
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await getAuthorizedUser("backup:manage");
    if (!session) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const fileName = searchParams.get("fileName");
    
    if (!fileName) {
      return NextResponse.json({ error: "Missing fileName" }, { status: 400 });
    }

    const fileBuffer = await BackupService.getBackupBuffer(fileName);
    return new Response(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(fileBuffer.length),
        'Content-Disposition': buildContentDisposition(fileName),
      }
    });
  } catch (error) {
    console.error("Download backup failed:", error);
    return NextResponse.json({ error: "下载失败" }, { status: 500 });
  }
}
