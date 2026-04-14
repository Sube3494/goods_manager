/*
 * @Date: 2026-02-15 09:50:56
 * @Author: Sube
 * @FilePath: route.ts
 * @LastEditTime: 2026-03-02 18:47:00
 * @Description: 
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { BackupService } from "@/lib/backup-service";

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await getAuthorizedUser("backup:manage");
    if (!session?.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { password } = await request.json();
    const encryptedBuffer = await BackupService.createExportBuffer(session.id, password);

    // 3. 先返回备份文件，异步更新最后备份时间（不阻塞响应）
    const response = new Response(Buffer.from(encryptedBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="PickNote_Backup_${new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(/[-: ]/g, '')}.pnk"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    });

    // 异步更新备份时间，失败不影响备份文件下载
    prisma.systemSetting.updateMany({
      data: { lastBackup: new Date() }
    }).catch(() => {});

    return response;

  } catch (error) {
    console.error("Encryption backup export failed:", error);
    return NextResponse.json({ error: "导出失败" }, { status: 500 });
  }
}
