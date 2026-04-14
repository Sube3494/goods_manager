/*
 * @Date: 2026-02-15 09:51:02
 * @Author: Sube
 * @FilePath: route.ts
 * @LastEditTime: 2026-03-05 13:38:13
 * @Description: 
 */
import { NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { BackupService } from "@/lib/backup-service";

export async function POST(request: Request) {
  try {
    const session = await getAuthorizedUser("backup:manage");
    if (!session) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const password = formData.get("password") as string;

    if (!file) {
      return NextResponse.json({ error: "文件必填" }, { status: 400 });
    }

    // 1. 解密数据
    const arrayBuffer = await file.arrayBuffer();
    const encryptedBuffer = Buffer.from(arrayBuffer);
    
    let decryptedData: string;
    try {
      decryptedData = BackupService.decryptBackupBuffer(encryptedBuffer, password);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "解密失败，密码错误或文件损坏" }, { status: 400 });
    }

    const data = JSON.parse(decryptedData);

    // 2. 执行数据库事务：全量恢复
    await BackupService.restoreFromData(data);

    return NextResponse.json({ success: true, message: "系统数据已全量恢复" });

  } catch (error) {
    console.error("Restore from encrypted backup failed:", error);
    return NextResponse.json({ error: "导入恢复失败" }, { status: 500 });
  }
}
