import imageCompression from "browser-image-compression";

type ChunkedUploadResult = {
  success: boolean;
  path?: string;
  publicUrl?: string;
  duplicate?: boolean;
  compressed?: boolean;
  originalSize?: number;
  compressedSize?: number;
  error?: string;
};

type UploadOptions = {
  userId?: string | null;
  onProgress?: (progress: number) => void;
  imageMaxWidthOrHeight?: number;
  imageQuality?: number;
  maxSingleRequestSizeMB?: number;
};

async function computeSHA256(file: File) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function compressImageIfNeeded(file: File, options?: UploadOptions) {
  if (!file.type.startsWith("image/")) {
    return { file, compressed: false };
  }

  const compressionOptions = {
    maxSizeMB: options?.imageQuality ? Math.max(options.imageQuality, 0.6) : 1.2,
    maxWidthOrHeight: options?.imageMaxWidthOrHeight || 1600,
    useWebWorker: true,
    initialQuality: options?.imageQuality || 0.82,
  };

  try {
    const compressed = await imageCompression(file, compressionOptions);
    if (compressed.size < file.size) {
      return { file: compressed, compressed: true };
    }
  } catch {
    // 忽略压缩失败，继续上传原图
  }

  return { file, compressed: false };
}

async function uploadSmallFile(file: File, options?: UploadOptions): Promise<ChunkedUploadResult> {
  const ext = file.name.split(".").pop() || "";
  const hash = await computeSHA256(file);

  const precheck = await fetch("/api/upload/precheck", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hash,
      size: file.size,
      contentType: file.type,
      ext,
      userId: options?.userId || null,
    }),
  });

  const precheckData = await precheck.json();
  if (!precheck.ok || !precheckData?.ok) {
    return {
      success: false,
      error: precheckData?.error || "上传预检查失败",
    };
  }

  if (precheckData.duplicate && precheckData.upload) {
    options?.onProgress?.(100);
    return {
      success: true,
      duplicate: true,
      path: precheckData.upload.path,
      publicUrl: precheckData.upload.publicUrl,
    };
  }

  const signResp = await fetch("/api/upload/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ext,
      contentType: file.type,
      userId: options?.userId || null,
    }),
  });

  const signData = await signResp.json();
  if (!signResp.ok || !signData?.ok) {
    return {
      success: false,
      error: signData?.error || "获取上传地址失败",
    };
  }

  const putResp = await fetch(signData.url as string, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!putResp.ok) {
    return {
      success: false,
      error: `上传文件失败 (${putResp.status})`,
    };
  }

  const commitResp = await fetch("/api/upload/commit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hash,
      size: file.size,
      contentType: file.type,
      ext,
      path: signData.path,
      publicUrl: signData.publicUrl,
      userId: options?.userId || null,
    }),
  });

  const commitData = await commitResp.json();
  if (!commitResp.ok || !commitData?.ok) {
    return {
      success: false,
      error: commitData?.error || "登记上传文件失败",
    };
  }

  options?.onProgress?.(100);
  return {
    success: true,
    path: signData.path,
    publicUrl: signData.publicUrl,
  };
}

export async function uploadFileWithChunking(
  inputFile: File,
  options?: UploadOptions,
): Promise<ChunkedUploadResult> {
  const originalSize = inputFile.size;
  const maxSingleRequestSize = (options?.maxSingleRequestSizeMB || 10) * 1024 * 1024;

  const { file, compressed } = await compressImageIfNeeded(inputFile, options);

  if (file.size <= maxSingleRequestSize) {
    const result = await uploadSmallFile(file, options);
    return {
      ...result,
      compressed,
      originalSize,
      compressedSize: file.size,
    };
  }

  return {
    success: false,
    error: "当前仅支持 10MB 以内文件上传，请压缩后重试",
    compressed,
    originalSize,
    compressedSize: file.size,
  };
}
