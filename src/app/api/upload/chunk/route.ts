import { NextResponse } from "next/server";
import { join } from "path";
import { tmpdir } from "os";
import { writeFile, mkdir, readdir, access } from "fs/promises";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";

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
    const session = await getSession();
    const settings = await prisma.systemSetting.findUnique({ where: { id: "system" } });
    
    const isGalleryUploadAllowed = settings ? settings.allowGalleryUpload : true;
    if (!session && !isGalleryUploadAllowed) {
      return NextResponse.json({ error: "实物上传功能已关闭" }, { status: 401 });
    }

    const formData = await request.formData();
    const fileId = formData.get("fileId") as string;
    const chunkIndexStr = formData.get("chunkIndex") as string;
    const chunk = formData.get("chunk") as Blob;

    const chunkIndex = parseInt(chunkIndexStr, 10);

    if (!fileId || isNaN(chunkIndex) || !chunk) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
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
