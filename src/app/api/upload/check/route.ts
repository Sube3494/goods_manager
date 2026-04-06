import { NextResponse } from "next/server";
import { getStorageStrategy } from "@/lib/storage";
import { getFreshSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { getNormalizedUploadExtension, isAllowedUploadExtension } from "@/lib/uploadValidation";

/**
 * POST /api/upload/check
 * 上传前 hash 预检：判断相同内容的文件是否已存在于存储中
 * Body: { hash: string, ext: string, folder?: string }
 * Response: { exists: boolean, url?: string }
 */
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

    const { hash, ext, folder, fileName, fileType } = await request.json();

    if (!hash || (!ext && !fileName)) {
      return NextResponse.json({ error: "Missing hash or file extension" }, { status: 400 });
    }

    const normalizedExt = getNormalizedUploadExtension(
      String(fileName || `upload.${ext}`),
      String(fileType || "")
    );

    if (!isAllowedUploadExtension(String(ext || normalizedExt))) {
      return NextResponse.json({ error: "仅支持上传图片或视频文件" }, { status: 400 });
    }

    const fileNameWithExt = `${hash}.${normalizedExt}`;
    const subFolder = folder || "gallery";
    // relativeUrl 格式与 GalleryItem.url 一致，本地为 /uploads/gallery/xxx.ext，MinIO 为 gallery/xxx.ext
    const storage = await getStorageStrategy();

    // 本地存储用 /uploads/... 路径，MinIO 用 folder/filename 路径
    const isMinioLike = !!(settings?.storageType === "minio");
    const relativeUrl = isMinioLike
      ? `${subFolder}/${fileNameWithExt}`
      : `/uploads/${subFolder}/${fileNameWithExt}`;

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
