import { NextResponse } from "next/server";
import { join } from "path";
import { tmpdir } from "os";
import { writeFile, mkdir, readdir, access } from "fs/promises";
import { getFreshSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { validateUploadFile } from "@/lib/uploadValidation";

const TEMP_DIR = join(tmpdir(), "goods_uploads_temp");

async function initTempDir() {
  try {
    await access(TEMP_DIR);
  } catch {
    await mkdir(TEMP_DIR, { recursive: true });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get("fileId");
  
  if (!fileId) return NextResponse.json({ error: "Missing fileId" }, { status: 400 });

  await initTempDir();
  
  try {
    const files = await readdir(TEMP_DIR);
    const chunkIndices = files
      .filter(f => f.startsWith(`${fileId}_`))
      .map(f => parseInt(f.substring(fileId.length + 1), 10))
      .filter(n => !isNaN(n));
      
    return NextResponse.json({ uploadedChunks: chunkIndices });
  } catch {
    return NextResponse.json({ uploadedChunks: [] });
  }
}

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

    const formData = await request.formData();
    const fileId = formData.get("fileId") as string;
    const chunkIndexStr = formData.get("chunkIndex") as string;
    const chunk = formData.get("chunk") as Blob;
    const fileName = formData.get("fileName") as string;
    const fileType = formData.get("fileType") as string;

    const chunkIndex = parseInt(chunkIndexStr, 10);

    if (!fileId || isNaN(chunkIndex) || !chunk || !fileName || !fileType) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const validation = validateUploadFile(fileName, fileType);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    await initTempDir();
    const chunkFilePath = join(TEMP_DIR, `${fileId}_${chunkIndex}`);
    
    const arrayBuffer = await chunk.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    await writeFile(chunkFilePath, buffer);

    return NextResponse.json({ success: true, chunkIndex });
  } catch (error) {
    console.error("Chunk Upload Error:", error);
    return NextResponse.json({ error: "Chunk upload failed" }, { status: 500 });
  }
}
