const ALLOWED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif"] as const;
const ALLOWED_VIDEO_EXTENSIONS = ["mp4", "webm", "ogg", "mov", "m4v"] as const;

const ALLOWED_IMAGE_MIME_PREFIX = "image/";
const ALLOWED_VIDEO_MIME_PREFIX = "video/";

const ALLOWED_EXTENSIONS = new Set<string>([
  ...ALLOWED_IMAGE_EXTENSIONS,
  ...ALLOWED_VIDEO_EXTENSIONS,
]);

export function getFileExtension(fileName: string) {
  const ext = fileName.split(".").pop()?.trim().toLowerCase() || "";
  return ext;
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

  if (!isAllowedUploadMimeType(fileType)) {
    return { ok: false as const, error: "文件类型不受支持，仅允许图片或视频" };
  }

  return { ok: true as const, ext };
}

