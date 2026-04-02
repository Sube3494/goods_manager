import { NextResponse } from "next/server";
import { getStorageStrategy } from "@/lib/storage";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";

export async function POST(request: Request) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    const settings = await prisma.systemSetting.findUnique({ where: { id: "system" } });
    const isGalleryUploadAllowed = settings ? settings.allowGalleryUpload : true;

    if (session) {
      if (!hasPermission(session, "gallery:upload")) {
        return NextResponse.json({ error: "Permission denied" }, { status: 403 });
      }
    } else if (!isGalleryUploadAllowed) {
      return NextResponse.json({ error: "实物上传功能已关闭" }, { status: 401 });
    }

    const { fileName, fileType, folder, useTimestamp } = await request.json();

    if (!fileName) {
       return NextResponse.json({ error: "Missing fileName for presign" }, { status: 400 });
    }

    const storage = await getStorageStrategy();
    
    // Check if the current strategy supports getting a presigned URL (Minio)
    if (storage.getPresignedUrl) {
      const presignResult = await storage.getPresignedUrl({
        name: fileName,
        type: fileType || "application/octet-stream",
        folder,
        useTimestamp: useTimestamp !== false
      });

      if (presignResult) {
        return NextResponse.json({ 
          provider: "minio", 
          ...presignResult,
          // 加上 name 作为在存储层最终解析出的本地名
          name: presignResult.fileName.split('/').pop() || presignResult.fileName
        });
      }
    }

    // Fallback to local
    return NextResponse.json({ provider: "local" });

  } catch (error) {
    console.error("Presign Error:", error);
    return NextResponse.json({ error: "Presign failed" }, { status: 500 });
  }
}
