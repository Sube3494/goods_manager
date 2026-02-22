import { NextResponse } from "next/server";
import { getStorageStrategy } from "@/lib/storage";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    // Check auth or system setting for guest upload
    const session = await getSession();
    const settings = await prisma.systemSetting.findUnique({ where: { id: "system" } });
    
    // Default to allowed if settings missing
    const isGalleryUploadAllowed = settings ? settings.allowGalleryUpload : true;

    // Allow if admin (session) or if gallery upload is allowed for guests
    if (!session && !isGalleryUploadAllowed) {
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
