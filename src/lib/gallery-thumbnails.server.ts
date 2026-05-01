import * as Minio from "minio";
import { access, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import prisma from "@/lib/prisma";
import { getStorageStrategy } from "@/lib/storage";
import type { Prisma } from "../../prisma/generated-client";

const THUMBNAIL_MAX_SIZE = 480;
const THUMBNAIL_QUALITY = 78;

const missingThumbnailWhere: Prisma.GalleryItemWhereInput = {
  type: { not: "video" as const },
  OR: [
    { thumbnailUrl: null },
    { thumbnailUrl: "" },
  ],
};

function resolveLocalUploadPath(relativeUrl: string) {
  let baseDir = join(process.cwd(), "public");
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const altDir = join(process.cwd(), ".next", "standalone", "public");
    if (!existsSync(baseDir) && existsSync(altDir)) {
      baseDir = altDir;
    }
  }

  const normalized = relativeUrl.startsWith("/")
    ? relativeUrl.substring(1)
    : relativeUrl;

  return join(baseDir, normalized);
}

function normalizeStoragePath(input: string) {
  let normalized = input.trim();

  if (!normalized) return "";

  if (/^https?:\/\//i.test(normalized)) {
    try {
      const url = new URL(normalized);
      normalized = url.pathname;
    } catch {
      return normalized;
    }
  }

  normalized = normalized.replace(/^\/+/, "");
  normalized = normalized.replace(/^uploads\//, "");

  return normalized;
}

async function readLocalFile(relativeUrl: string) {
  const filePath = resolveLocalUploadPath(relativeUrl);
  await access(filePath);
  return readFile(filePath);
}

async function readMinioObject(objectName: string) {
  const settings = await prisma.systemSetting.findUnique({ where: { id: "system" } });
  if (!settings?.minioEndpoint || !settings.minioAccessKey || !settings.minioSecretKey) {
    throw new Error("MinIO is not configured");
  }

  const client = new Minio.Client({
    endPoint: settings.minioEndpoint.replace(/^\[|\]$/g, ""),
    port: settings.minioPort ? Number(settings.minioPort) : undefined,
    useSSL: settings.minioUseSSL,
    accessKey: settings.minioAccessKey,
    secretKey: settings.minioSecretKey,
  });

  const bucketName = settings.minioBucket || "goods-manager";
  const normalizedObjectName = normalizeStoragePath(objectName);
  if (!normalizedObjectName) {
    throw new Error(`Invalid MinIO object name: ${objectName}`);
  }
  const stream = await client.getObject(bucketName, normalizedObjectName);
  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });

  return Buffer.concat(chunks);
}

function buildThumbnailName(relativeUrl: string) {
  const clean = normalizeStoragePath(relativeUrl);
  const extIndex = clean.lastIndexOf(".");
  const base = extIndex === -1 ? clean : clean.substring(0, extIndex);
  return `${base}_thumb.jpg`;
}

function buildThumbnailFolder(url: string) {
  const clean = normalizeStoragePath(url);
  const segments = clean.split("/").filter(Boolean);
  if (segments.length <= 1) {
    return "thumbs";
  }

  return [...segments.slice(0, -1), "thumbs"].join("/");
}

function canBackfillThumbnail(url: string, type?: string | null) {
  if (type === "video") return false;
  return /\.(jpe?g|png|webp|bmp|avif)$/i.test(url);
}

async function loadOriginalBuffer(url: string) {
  if (url.startsWith("/uploads/") || url.startsWith("uploads/")) {
    return readLocalFile(url.startsWith("/") ? url : `/${url}`);
  }

  return readMinioObject(url);
}

async function createThumbnailBuffer(input: Buffer) {
  const sharp = await loadSharp();
  return sharp(input, { animated: false })
    .rotate()
    .resize({
      width: THUMBNAIL_MAX_SIZE,
      height: THUMBNAIL_MAX_SIZE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({
      quality: THUMBNAIL_QUALITY,
      mozjpeg: true,
    })
    .toBuffer();
}

async function loadSharp() {
  try {
    const { createRequire } = await import("node:module");
    const runtimeRequire = createRequire(join(process.cwd(), "package.json"));
    const moduleName = ["sh", "arp"].join("");
    const sharpModule = runtimeRequire(moduleName);
    return (sharpModule.default ?? sharpModule) as SharpLike;
  } catch (error) {
    console.error("Failed to load sharp for thumbnail backfill:", error);
    throw new Error("Thumbnail backfill requires the optional 'sharp' dependency to be installed.");
  }
}

type SharpLike = {
  (input?: Buffer, options?: { animated?: boolean }): {
    rotate(): {
      resize(options: {
        width: number;
        height: number;
        fit: "inside";
        withoutEnlargement: boolean;
      }): {
        jpeg(options: { quality: number; mozjpeg: boolean }): {
          toBuffer(): Promise<Buffer>;
        };
      };
    };
  };
};

export async function backfillGalleryThumbnails(limit = 60) {
  const items = await prisma.galleryItem.findMany({
    where: missingThumbnailWhere,
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const storage = await getStorageStrategy();
  let processed = 0;
  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of items) {
    processed += 1;

    if (!canBackfillThumbnail(item.url, item.type)) {
      await prisma.galleryItem.update({
        where: { id: item.id },
        data: {
          thumbnailUrl: item.url,
        },
      });
      skipped += 1;
      continue;
    }

    try {
      const source = await loadOriginalBuffer(item.url);
      const thumbnailBuffer = await createThumbnailBuffer(source);
      const thumbnailName = buildThumbnailName(item.url).split("/").pop() || `thumb-${item.id}.jpg`;
      const uploadFolder = buildThumbnailFolder(item.url);

      const uploadResult = await storage.upload(thumbnailBuffer, {
        name: thumbnailName,
        type: "image/jpeg",
        folder: uploadFolder,
      });

      await prisma.galleryItem.update({
        where: { id: item.id },
        data: {
          thumbnailUrl: storage.stripUrl(uploadResult.url) || uploadResult.url,
        },
      });

      generated += 1;
    } catch (error) {
      failed += 1;
      console.error(`Failed to backfill thumbnail for gallery item ${item.id}:`, error);
    }
  }

  const remaining = await prisma.galleryItem.count({
    where: missingThumbnailWhere,
  });

  return {
    processed,
    generated,
    skipped,
    failed,
    remaining,
  };
}

export async function countGalleryItemsMissingThumbnails() {
  return prisma.galleryItem.count({
    where: missingThumbnailWhere,
  });
}
