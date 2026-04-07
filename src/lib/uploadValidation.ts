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
  const normalizedType = fileType.trim().toLowerCase();

  // 专项拦截 HEIC
  if (ext === "heic" || ext === "heif" || normalizedType.includes("heic") || normalizedType.includes("heif")) {
    return { 
      ok: false as const, 
      error: "不支持 HEIC 格式图片，请在手机上将其转换为 JPG 后再上传" 
    };
  }

  if (!ext || !isAllowedUploadExtension(ext)) {
    return { ok: false as const, error: "仅支持上传图片或视频文件" };
  }

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
