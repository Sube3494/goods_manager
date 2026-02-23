import { NextResponse } from "next/server";
import { getStorageStrategy } from "@/lib/storage";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * POST /api/upload/check
 * 上传前 hash 预检：判断相同内容的文件是否已存在于存储中
 * Body: { hash: string, ext: string, folder?: string }
 * Response: { exists: boolean, url?: string }
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    const settings = await prisma.systemSetting.findUnique({ where: { id: "system" } });
    const isGalleryUploadAllowed = settings ? settings.allowGalleryUpload : true;

    if (!session && !isGalleryUploadAllowed) {
      return NextResponse.json({ error: "实物上传功能已关闭" }, { status: 401 });
    }

    const { hash, ext, folder } = await request.json();

    if (!hash || !ext) {
      return NextResponse.json({ error: "Missing hash or ext" }, { status: 400 });
    }

    const fileName = `${hash}.${ext}`;
    const subFolder = folder || "gallery";
    // relativeUrl 格式与 GalleryItem.url 一致，本地为 /uploads/gallery/xxx.ext，MinIO 为 gallery/xxx.ext
    const storage = await getStorageStrategy();

    // 本地存储用 /uploads/... 路径，MinIO 用 folder/filename 路径
    const isMinioLike = !!(settings?.storageType === "minio");
    const relativeUrl = isMinioLike
      ? `${subFolder}/${fileName}`
      : `/uploads/${subFolder}/${fileName}`;

    const fileExists = await storage.exists(relativeUrl);

    if (!fileExists) {
      return NextResponse.json({ exists: false });
    }

    // 文件存在，返回可访问的公开 URL
    const resolvedUrl = storage.resolveUrl(relativeUrl);
    return NextResponse.json({ exists: true, url: resolvedUrl, relativeUrl });
  } catch (error) {
    console.error("Upload check failed:", error);
    return NextResponse.json({ error: "Check failed" }, { status: 500 });
  }
}
