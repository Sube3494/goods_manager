import { NextRequest, NextResponse } from "next/server";
import { join } from "path";
import { access, readFile, stat } from "fs/promises";
import { createReadStream, existsSync } from "fs";
import { Readable } from "stream";
import sharp from "sharp";

function buildContentDisposition(fileName: string) {
  const safeFileName = fileName.replace(/["\r\n]/g, "_");
  const encodedFileName = encodeURIComponent(fileName);
  return `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`;
}

function supportsExifRewrite(ext: string | undefined) {
  return ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "webp";
}

function normalizeMetadataTimestamp(rawValue: string | null, rawOffset: string | null) {
  const text = String(rawValue || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const offsetText = String(rawOffset || "").trim();
  const timezoneOffset = /^[+-]\d{2}:\d{2}$/.test(offsetText) ? offsetText : "+08:00";

  const [, year, month, day, hours, minutes, seconds] = match;
  const exifDateTime = `${year}:${month}:${day} ${hours}:${minutes}:${seconds}`;
  return {
    exifDateTime,
    timezoneOffset,
  };
}

async function buildImageDownloadBuffer(fullPath: string, ext: string, metadataTimestamp: NonNullable<ReturnType<typeof normalizeMetadataTimestamp>>) {
  const source = await readFile(fullPath);
  let pipeline = sharp(source).rotate().withExif({
    IFD0: {
      DateTime: metadataTimestamp.exifDateTime,
    },
    ExifIFD: {
      DateTimeOriginal: metadataTimestamp.exifDateTime,
      DateTimeDigitized: metadataTimestamp.exifDateTime,
      OffsetTime: metadataTimestamp.timezoneOffset,
      OffsetTimeOriginal: metadataTimestamp.timezoneOffset,
      OffsetTimeDigitized: metadataTimestamp.timezoneOffset,
    },
  });

  if (ext === "png") {
    pipeline = pipeline.png();
  } else if (ext === "webp") {
    pipeline = pipeline.webp();
  } else {
    pipeline = pipeline.jpeg();
  }

  return pipeline.toBuffer();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const filePath = path.join("/");
    const requestedFileName = request.nextUrl.searchParams.get("download");
    const metadataTimestamp = normalizeMetadataTimestamp(
      request.nextUrl.searchParams.get("downloadedAt"),
      request.nextUrl.searchParams.get("downloadedOffset"),
    );
    
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

    const fileStat = await stat(fullPath);
    
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

    if (requestedFileName && metadataTimestamp && supportsExifRewrite(ext)) {
      const buffer = await buildImageDownloadBuffer(fullPath, ext!, metadataTimestamp);
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(buffer.byteLength),
          "Cache-Control": "no-store",
          "Content-Disposition": buildContentDisposition(requestedFileName),
        },
      });
    }

    return new NextResponse(Readable.toWeb(createReadStream(fullPath)) as ReadableStream, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fileStat.size),
        "Cache-Control": "public, max-age=31536000, immutable", // 强缓存
        ...(requestedFileName ? { "Content-Disposition": buildContentDisposition(requestedFileName) } : {}),
      },
    });
  } catch (error) {
    console.error("Serve Uploaded File Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
