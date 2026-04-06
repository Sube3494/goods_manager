const ALLOWED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif", "heic", "heif"] as const;
const ALLOWED_VIDEO_EXTENSIONS = ["mp4", "webm", "ogg", "mov", "m4v"] as const;

const ALLOWED_IMAGE_MIME_PREFIX = "image/";
const ALLOWED_VIDEO_MIME_PREFIX = "video/";
const HEIC_MIME_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

const ALLOWED_EXTENSIONS = new Set<string>([
  ...ALLOWED_IMAGE_EXTENSIONS,
  ...ALLOWED_VIDEO_EXTENSIONS,
]);

export function getFileExtension(fileName: string) {
  const ext = fileName.split(".").pop()?.trim().toLowerCase() || "";
  return ext;
}

export function isHeicLikeUpload(fileName: string, fileType: string) {
  const ext = getFileExtension(fileName);
  const normalizedType = fileType.trim().toLowerCase();
  return ext === "heic" || ext === "heif" || HEIC_MIME_TYPES.has(normalizedType);
}

export function getNormalizedUploadExtension(fileName: string, fileType: string) {
  return isHeicLikeUpload(fileName, fileType) ? "jpg" : getFileExtension(fileName);
}

export function isAllowedUploadExtension(ext: string) {
  return ALLOWED_EXTENSIONS.has(ext.trim().toLowerCase());
}

export function isAllowedUploadMimeType(fileType: string) {
  if (!fileType) return false;
  return fileType.startsWith(ALLOWED_IMAGE_MIME_PREFIX) || fileType.startsWith(ALLOWED_VIDEO_MIME_PREFIX);
}

export function validateUploadFile(fileName: string, fileType: string) {
  const ext = getFileExtension(fileName);

  if (!ext || !isAllowedUploadExtension(ext)) {
    return { ok: false as const, error: "仅支持上传图片或视频文件" };
  }

  const normalizedType = fileType.trim().toLowerCase();
  const allowByMime =
    isAllowedUploadMimeType(normalizedType) ||
    normalizedType === "" ||
    normalizedType === "application/octet-stream" ||
    normalizedType === "image/*" ||
    normalizedType === "video/*";

  if (!allowByMime) {
    return { ok: false as const, error: "文件类型不受支持，仅允许图片或视频" };
  }

  return { ok: true as const, ext };
}
