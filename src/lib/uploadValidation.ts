const ALLOWED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif", "heic", "heif"] as const;
const ALLOWED_VIDEO_EXTENSIONS = ["mp4", "webm", "ogg", "mov", "m4v"] as const;

const ALLOWED_IMAGE_MIME_PREFIX = "image/";
const ALLOWED_VIDEO_MIME_PREFIX = "video/";

const ALLOWED_EXTENSIONS = new Set<string>([
  ...ALLOWED_IMAGE_EXTENSIONS,
  ...ALLOWED_VIDEO_EXTENSIONS,
]);

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/heif": "heif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/ogg": "ogg",
  "video/quicktime": "mov",
  "video/x-m4v": "m4v",
};

export function getFileExtension(fileName: string) {
  const ext = fileName.split(".").pop()?.trim().toLowerCase() || "";
  return ext;
}

export function inferExtensionFromMimeType(fileType: string) {
  return MIME_EXTENSION_MAP[fileType.trim().toLowerCase()] || "";
}

export function resolveUploadExtension(fileName: string, fileType: string) {
  const ext = getFileExtension(fileName);
  if (ext && isAllowedUploadExtension(ext)) {
    return ext;
  }

  const inferredExt = inferExtensionFromMimeType(fileType);
  if (inferredExt && isAllowedUploadExtension(inferredExt)) {
    return inferredExt;
  }

  return "";
}

export function isAllowedUploadExtension(ext: string) {
  return ALLOWED_EXTENSIONS.has(ext.trim().toLowerCase());
}

export function isAllowedUploadMimeType(fileType: string) {
  if (!fileType) return false;
  return fileType.startsWith(ALLOWED_IMAGE_MIME_PREFIX) || fileType.startsWith(ALLOWED_VIDEO_MIME_PREFIX);
}

export function validateUploadFile(fileName: string, fileType: string) {
  const ext = resolveUploadExtension(fileName, fileType);

  if (!ext || !isAllowedUploadExtension(ext)) {
    return { ok: false as const, error: "仅支持上传图片或视频文件" };
  }

  if (!isAllowedUploadMimeType(fileType)) {
    return { ok: false as const, error: "文件类型不受支持，仅允许图片或视频" };
  }

  return { ok: true as const, ext };
}
