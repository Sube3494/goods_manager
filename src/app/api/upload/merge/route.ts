import { NextResponse } from "next/server";
import { join } from "path";
import { tmpdir } from "os";
import { createReadStream } from "fs";
import { access, unlink } from "fs/promises";
import { getStorageStrategy } from "@/lib/storage";
import { getFreshSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { PassThrough, Readable } from "stream";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { validateUploadFile } from "@/lib/uploadValidation";

const TEMP_DIR = join(tmpdir(), "goods_uploads_temp");

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

    const body = await request.json();
    const { fileId, fileName, fileType, totalChunks, folder, useTimestamp } = body;

    if (!fileId || !fileName || !totalChunks) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    const validation = validateUploadFile(fileName, fileType || "application/octet-stream");
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Verify all chunks exist
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = join(TEMP_DIR, `${fileId}_${i}`);
      try {
        await access(chunkPath);
      } catch {
        return NextResponse.json({ error: `Missing chunk ${i} for fileId ${fileId}` }, { status: 400 });
      }
    }

    const passThrough = new PassThrough();

    const pumpChunks = async () => {
      try {
        for (let i = 0; i < totalChunks; i++) {
          const chunkPath = join(TEMP_DIR, `${fileId}_${i}`);
          const stream = createReadStream(chunkPath);
          await new Promise((resolve, reject) => {
            stream.pipe(passThrough, { end: false });
            stream.on("end", () => resolve(undefined));
            stream.on("error", reject);
          });
        }
        passThrough.end();
      } catch (err) {
        passThrough.destroy(err as NodeJS.ErrnoException);
      }
    };

    // 起飞传输任务，同时 storage.upload 也会立刻拿走管道一边发包
    pumpChunks();

    const storage = await getStorageStrategy();

    // 强制 skipHash，合并直通没有必要再度将文件落盘做校验
    const result = await storage.upload(passThrough as Readable, {
        name: fileName,
        type: fileType,
        folder,
        useTimestamp: useTimestamp !== false, 
        skipHash: true
    });

    // Clean up temp chunks
    for (let i = 0; i < totalChunks; i++) {
        const chunkPath = join(TEMP_DIR, `${fileId}_${i}`);
        await unlink(chunkPath).catch(() => {});
    }

    return NextResponse.json({
        ...result,
        url: storage.resolveUrl(result.url),
        path: result.url
    });

  } catch (error) {
    console.error("Merge Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Merge failed" }, { status: 500 });
  }
}
