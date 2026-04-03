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
    type: compressed.type || "image/jpeg",
    lastModified: file.lastModified,
  });
}

export async function uploadGalleryMedia(
  file: File,
  folder = "gallery",
  onProgress?: (percent: number) => void
): Promise<UploadedGalleryMedia> {
  const original = await uploadFileWithChunking(file, folder, onProgress);
  const type = original.type === "video" ? "video" : "image";

  const result: UploadedGalleryMedia = {
    url: original.url,
    path: original.path || original.name || original.url,
    type,
    skipped: original.skipped,
  };

  if (!canGenerateThumbnail(file) || type !== "image") {
    return result;
  }

  try {
    const thumbnailFile = await createThumbnailFile(file);
    const thumbnail = await uploadFileWithChunking(thumbnailFile, `${folder}/thumbs`);
    result.thumbnailUrl = thumbnail.url;
    result.thumbnailPath = thumbnail.path || thumbnail.name || thumbnail.url;
  } catch (error) {
    console.warn("Failed to generate/upload gallery thumbnail:", error);
  }

  return result;
}
