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

    // Logic: 
    // 1. If user is logged in (session exists), we consider them an admin/authorized user. 
    // 2. If no session but allowGalleryUpload is true, they are a guest contributor.

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

      const result = await storage.upload(file, {
        name: file.name,
        type: file.type,
        folder,
        useTimestamp
      });
      return NextResponse.json({
        ...result,
        url: storage.resolveUrl(result.url)
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
      url: storage.resolveUrl(result.url)
    });

  } catch (error) {
    console.error("Upload Error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
