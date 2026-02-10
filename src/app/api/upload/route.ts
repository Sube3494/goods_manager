import { NextResponse } from "next/server";
import { getStorageStrategy } from "@/lib/storage";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    // Check permissions
    const session = await getSession();
    
    // If not admin (no session), check system settings
    if (!session) {
      const settings = await prisma.systemSetting.findUnique({
        where: { id: "system" }
      });

      if (settings && settings.allowGalleryUpload === false) {
        return NextResponse.json({ error: "系统已关闭实物照片上传功能" }, { status: 403 });
      }
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
      const result = await storage.upload(file);
      return NextResponse.json(result);
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
    const result = await storage.upload(request.body, {
      name: decodeURIComponent(fileName),
      type: fileType
    });

    return NextResponse.json(result);

  } catch (error) {
    console.error("Upload Error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
