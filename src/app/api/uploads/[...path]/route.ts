import { NextRequest, NextResponse } from "next/server";
import { join } from "path";
import { readFile, access } from "fs/promises";
import { existsSync } from "fs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const filePath = path.join("/");
    
    // 确定上传目录
    let baseDir = join(process.cwd(), "public", "uploads");
    
    // 如果在 standalone 目录下运行，尝试定位正确的 public 目录
    if (!existsSync(baseDir)) {
      const altDir = join(process.cwd(), ".next", "standalone", "public", "uploads");
      if (existsSync(altDir)) {
        baseDir = altDir;
      }
    }

    const fullPath = join(baseDir, filePath);

    // 安全检查：确保路径在 uploads 目录下
    if (!fullPath.startsWith(baseDir)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    try {
      await access(fullPath);
    } catch {
      return new NextResponse("Not Found", { status: 404 });
    }

    const fileBuffer = await readFile(fullPath);
    
    // 简单的 MIME 类型判断
    const ext = filePath.split(".").pop()?.toLowerCase();
    let contentType = "application/octet-stream";
    
    const mimeTypes: Record<string, string> = {
      "jpg": "image/jpeg",
      "jpeg": "image/jpeg",
      "png": "image/png",
      "gif": "image/gif",
      "webp": "image/webp",
      "svg": "image/svg+xml",
      "mp4": "video/mp4",
      "webm": "video/webm",
      "mov": "video/quicktime",
    };

    if (ext && mimeTypes[ext]) {
      contentType = mimeTypes[ext];
    }

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable", // 强缓存
      },
    });
  } catch (error) {
    console.error("Serve Uploaded File Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
