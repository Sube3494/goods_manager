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

const EXTENSION_MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  webm: "video/webm",
  ogg: "video/ogg",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
};

export function getFileExtension(fileName: string) {
  const ext = fileName.split(".").pop()?.trim().toLowerCase() || "";
  return ext;
}

export function inferExtensionFromMimeType(fileType: string) {
  const normalized = fileType.trim().toLowerCase();
  if (MIME_EXTENSION_MAP[normalized]) {
    return MIME_EXTENSION_MAP[normalized];
  }

  // Some mobile browsers only return coarse MIME values like `image/*`.
  if (normalized.startsWith("image/")) {
    return "jpg";
  }

  if (normalized.startsWith("video/")) {
    return "mp4";
  }

  return "";
}

export function inferMimeTypeFromExtension(ext: string) {
  return EXTENSION_MIME_MAP[ext.trim().toLowerCase()] || "";
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

  const normalizedType = fileType.trim().toLowerCase();
  const inferredMime = inferMimeTypeFromExtension(ext);
  const allowByMime =
    isAllowedUploadMimeType(normalizedType) ||
    normalizedType === "" ||
    normalizedType === "application/octet-stream" ||
    normalizedType === "image/*" ||
    normalizedType === "video/*";

  if (!allowByMime) {
    return { ok: false as const, error: "文件类型不受支持，仅允许图片或视频" };
  }

  return { ok: true as const, ext, mime: isAllowedUploadMimeType(normalizedType) ? normalizedType : inferredMime };
}
