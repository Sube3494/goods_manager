"use client";

import imageCompression from "browser-image-compression";
import { uploadFileWithChunking } from "@/lib/uploadWithChunking";

export interface UploadedGalleryMedia {
  url: string;
  path: string;
  type: "image" | "video";
  skipped?: boolean;
  thumbnailUrl?: string;
  thumbnailPath?: string;
}

const THUMBNAIL_OPTIONS = {
  maxWidthOrHeight: 480,
  maxSizeMB: 0.18,
  initialQuality: 0.78,
  maxIteration: 5,
} as const;

function canGenerateThumbnail(file: File) {
  return file.type.startsWith("image/") && !file.type.includes("gif") && !file.type.includes("svg");
}

async function createThumbnailFile(file: File) {
  const compressed = await imageCompression(file, {
    ...THUMBNAIL_OPTIONS,
    useWebWorker: true,
    preserveExif: false,
    fileType: "image/jpeg",
  });

  const baseName = file.name.replace(/\.[^.]+$/, "");

  return new File([compressed], `${baseName}_thumb.jpg`, {
    type: "image/jpeg",
    lastModified: file.lastModified,
  });
}

function isHeif(file: File) {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return type.includes("heic") || type.includes("heif") || name.endsWith(".heic") || name.endsWith(".heif");
}

async function convertHeifToJpeg(file: File): Promise<File> {
  // 使用高质量参数将 HEIC 转换为 JPEG，尽可能保留原图细节
  const converted = await imageCompression(file, {
    maxSizeMB: 10, // 足够大以不压缩尺寸 (Large enough to keep original size)
    maxWidthOrHeight: 4096, // 常见手机照片的最大尺寸 (Max size for phone photos)
    useWebWorker: true,
    fileType: "image/jpeg",
    initialQuality: 0.95,
  });

  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([converted], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: file.lastModified,
  });
}

export async function uploadGalleryMedia(
  file: File,
  folder = "gallery",
  onProgress?: (percent: number) => void
): Promise<UploadedGalleryMedia> {
  let finalFile = file;
  
  // 如果是 HEIF/HEIC，先执行客户端转码 (Client-side transcode)
  if (isHeif(file)) {
    try {
      finalFile = await convertHeifToJpeg(file);
    } catch (error) {
      console.warn("Client-side HEIF conversion failed, falling back to original:", error);
    }
  }

  const original = await uploadFileWithChunking(finalFile, folder, onProgress);
  const type = original.type === "video" ? "video" : "image";

  const result: UploadedGalleryMedia = {
    url: original.url,
    path: original.path || original.name || original.url,
    type,
    skipped: original.skipped,
  };

  if (!canGenerateThumbnail(finalFile) || type !== "image") {
    return result;
  }

  try {
    const thumbnailFile = await createThumbnailFile(finalFile);
    const thumbnail = await uploadFileWithChunking(thumbnailFile, `${folder}/thumbs`);
    result.thumbnailUrl = thumbnail.url;
    result.thumbnailPath = thumbnail.path || thumbnail.name || thumbnail.url;
  } catch (error) {
    console.warn("Failed to generate/upload gallery thumbnail:", error);
  }

  return result;
}
