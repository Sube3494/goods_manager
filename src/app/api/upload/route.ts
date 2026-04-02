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

    const contentType = request.headers.get("content-type") || "";
    const contentLength = Number(request.headers.get("content-length") || "0");
    
    // Server-side size validation (50MB Hard limit)
    if (contentLength > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "文件大小超过服务器限制 (50MB)" }, { status: 413 });
    }
    
    // Handle FormData (Legacy/Small files)
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

      const storage = await getStorageStrategy();
      const folder = request.headers.get("x-folder") || undefined;
      const useTimestamp = request.headers.get("x-use-timestamp") === "true";
      const overrideName = request.headers.get("x-file-name");

      const result = await storage.upload(file, {
        name: overrideName || file.name,
        type: file.type,
        folder,
        useTimestamp
      });
      return NextResponse.json({
        ...result,
        url: storage.resolveUrl(result.url),
        path: result.url // 增加原始路径字段，供数据库保存使用
      });
    } 
    
    // Handle Raw Body (Large files - Streaming)
    const fileName = request.headers.get("x-file-name");
    const fileType = request.headers.get("x-file-type") || contentType;

    if (!fileName) {
       return NextResponse.json({ error: "Missing x-file-name header for raw upload" }, { status: 400 });
    }

    if (!request.body) {
       return NextResponse.json({ error: "Empty request body" }, { status: 400 });
    }

    const storage = await getStorageStrategy();
    const folder = request.headers.get("x-folder") || undefined;
    const useTimestamp = request.headers.get("x-use-timestamp") === "true";

    const result = await storage.upload(request.body, {
      name: decodeURIComponent(fileName),
      type: fileType,
      folder,
      useTimestamp
    });

    return NextResponse.json({
      ...result,
      url: storage.resolveUrl(result.url),
      path: result.url // 增加原始路径字段，供数据库保存使用
    });

  } catch (error) {
    console.error("Upload Error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
