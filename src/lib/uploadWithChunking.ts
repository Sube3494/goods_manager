import imageCompression from "browser-image-compression";
import { resolveUploadExtension } from "@/lib/uploadValidation";

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

const IMAGE_COMPRESSION_TARGETS = {
  maxWidthOrHeight: 2560,
  maxSizeMB: 2.2,
  initialQuality: 0.96,
  maxIteration: 6,
} as const;

async function maybeCompressImageBeforeUpload(file: File) {
  if (!file.type.startsWith("image/") || file.type.includes("gif")) {
    return file;
  }

  // Smaller assets don't benefit much from client-side recompression.
  if (file.size <= 900 * 1024) {
    return file;
  }

  try {
    const compressedFile = await imageCompression(file, {
      ...IMAGE_COMPRESSION_TARGETS,
      useWebWorker: true,
      preserveExif: true,
    });

    if (compressedFile.size >= file.size) {
      return file;
    }

    const savedRatio = ((file.size - compressedFile.size) / file.size) * 100;
    console.log(
      `[Image Compression] ${file.name}: ${(file.size / 1024 / 1024).toFixed(2)}MB -> ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB (saved ${savedRatio.toFixed(1)}%)`
    );

    return new File([compressedFile], file.name, {
      type: compressedFile.type || file.type,
      lastModified: file.lastModified,
    });
  } catch (error) {
    console.warn("图片压缩失败，降级使用原文件:", error);
    return file;
  }
}

/** 计算文件的 SHA-256 哈希（十六进制字符串） */
async function computeFileSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sniffFileSignature(file: File): Promise<{ ext: string; mime: string } | null> {
  try {
    const buffer = await file.slice(0, 32).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const ascii = Array.from(bytes)
      .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : "."))
      .join("");

    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return { ext: "jpg", mime: "image/jpeg" };
    }

    if (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      return { ext: "png", mime: "image/png" };
    }

    if (ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a")) {
      return { ext: "gif", mime: "image/gif" };
    }

    if (ascii.slice(8, 12) === "WEBP" && ascii.startsWith("RIFF")) {
      return { ext: "webp", mime: "image/webp" };
    }

    if (bytes.length >= 12 && ascii.slice(4, 8) === "ftyp") {
      const brand = ascii.slice(8, 12);
      const brandFamily = ascii.slice(8, 16);

      if (brand === "heic" || brand === "heix" || brand === "hevc" || brand === "hevx" || brandFamily.includes("heic")) {
        return { ext: "heic", mime: "image/heic" };
      }

      if (brand === "mif1" || brand === "msf1" || brandFamily.includes("heif")) {
        return { ext: "heif", mime: "image/heif" };
      }

      if (brand === "qt  ") {
        return { ext: "mov", mime: "video/quicktime" };
      }

      if (["isom", "iso2", "mp41", "mp42", "avc1"].includes(brand)) {
        return { ext: "mp4", mime: "video/mp4" };
      }
    }
  } catch (error) {
    console.warn("Failed to sniff file signature:", error);
  }

  return null;
}

async function coerceCameraFileToRecognizableFile(file: File) {
  const signature = await sniffFileSignature(file);
  if (!signature) {
    return file;
  }

  const currentExt = resolveUploadExtension(file.name, file.type);
  const currentType = file.type?.trim().toLowerCase() || "";
  const signatureMatches =
    currentExt === signature.ext &&
    (!!currentType ? currentType === signature.mime : false);

  if (signatureMatches) {
    return file;
  }

  const baseName = file.name.replace(/\.[^.]+$/, "").trim() || "camera_upload";
  return new File([file], `${baseName}.${signature.ext}`, {
    type: signature.mime,
    lastModified: file.lastModified || Date.now(),
  });
}

async function normalizeProblematicCapturedImage(file: File) {
  const resolvedExt = resolveUploadExtension(file.name, file.type);
  const hasStableImageType = file.type.startsWith("image/") && file.type !== "image/*";
  const hasStableImageExt = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif", "heic", "heif"].includes(resolvedExt);

  if (hasStableImageType && hasStableImageExt) {
    return file;
  }

  const shouldAttemptImageRecovery =
    file.type.startsWith("image/") ||
    file.type === "" ||
    file.type === "application/octet-stream" ||
    file.type === "image/*";

  if (!shouldAttemptImageRecovery) {
    return file;
  }

  try {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    const loaded = await new Promise<boolean>((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = objectUrl;
    });
    URL.revokeObjectURL(objectUrl);

    if (!loaded) {
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return file;
    }

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const jpegBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
    });

    if (!jpegBlob) {
      return file;
    }

    const baseName = file.name.replace(/\.[^.]+$/, "").trim() || "camera_upload";
    return new File([jpegBlob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified || Date.now(),
    });
  } catch (error) {
    console.warn("Failed to normalize captured camera image, fallback to original file:", error);
    return file;
  }
}

function normalizeUploadFileName(file: File) {
  const ext = resolveUploadExtension(file.name, file.type);
  const hasAllowedExt = !!ext && file.name.toLowerCase().endsWith(`.${ext}`);

  if (!ext || hasAllowedExt) {
    if (hasAllowedExt) {
      return file;
    }

    if (ext) {
      const baseName = file.name.replace(/\.[^.]+$/, "").trim() || "camera_upload";
      return new File([file], `${baseName}.${ext}`, {
        type: file.type,
        lastModified: file.lastModified,
      });
    }

    const coarseExt = file.type.startsWith("image/") ? "jpg" : file.type.startsWith("video/") ? "mp4" : "";
    if (!coarseExt) {
      return file;
    }

    const coarseBaseName = file.name.replace(/\.[^.]+$/, "").trim() || "camera_upload";
    return new File([file], `${coarseBaseName}.${coarseExt}`, {
      type: file.type,
      lastModified: file.lastModified,
    });
  }

  const baseName = file.name.replace(/\.[^.]+$/, "").trim() || "camera_upload";
  return new File([file], `${baseName}.${ext}`, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

export async function uploadFileWithChunking(
  file: File,
  folder?: string,
  onProgress?: (percent: number) => void
): Promise<{ url: string; path?: string; type: string; skipped?: boolean; name?: string }> {
  file = await coerceCameraFileToRecognizableFile(file);
  file = await normalizeProblematicCapturedImage(file);
  file = normalizeUploadFileName(file);
  file = await maybeCompressImageBeforeUpload(file);

  // ── 去重预检：计算 SHA-256 后询问服务端是否已有相同文件 ──
  // 仅对小文件（非分块上传路径）做去重；大文件仍走分块上传
  if (file.size <= CHUNK_SIZE) {
    try {
      const hash = await computeFileSha256(file);
      const ext = resolveUploadExtension(file.name, file.type);

      const checkRes = await fetch("/api/upload/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash, ext, folder: folder || "gallery" }),
      });

      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (checkData.exists && checkData.url) {
          // 文件已存在，直接复用
          const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(file.name);
          if (onProgress) onProgress(100);
          return {
            url: checkData.url,
            path: checkData.relativeUrl,
            type: isVideo ? "video" : "image",
            skipped: true,
            // 将 relativeUrl 透传，供调用方写入 GalleryItem.url
            name: checkData.relativeUrl,
          };
        }

        // 文件不存在，用 hash 命名继续上传（避免重复内容存两份）
        const hashFileName = `${hash}.${ext}`;

        // 1. Presign（MinIO）
        const presignRes = await fetch("/api/upload/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: hashFileName,
            fileType: file.type || "application/octet-stream",
            folder,
            useTimestamp: false, // hash 命名，不再加时间戳
          }),
        });

        if (presignRes.ok) {
          const presignData = await presignRes.json();

          if (presignData.provider === "minio") {
            return new Promise((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.open("PUT", presignData.url, true);
              xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

              if (onProgress) {
                xhr.upload.onprogress = (e) => {
                  if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
                };
              }

              xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                  const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(hashFileName);
                  if (onProgress) onProgress(100);
                  resolve({
                    url: presignData.publicUrl,
                    path: presignData.name,
                    type: isVideo ? "video" : "image",
                    name: presignData.name,
                  });
                } else {
                  reject(new Error(`MinIO upload failed with status ${xhr.status}`));
                }
              };

              xhr.onerror = () => reject(new Error("Network error during MinIO upload"));
              xhr.send(file);
            });
          }

          // 本地存储：用 hash 文件名走 normalUpload
          return normalUpload(file, folder, onProgress, hashFileName);
        }
      }
    } catch (checkError) {
      // 预检失败不阻塞上传，降级到原有流程
      console.warn("Hash check failed, falling back to normal upload:", checkError);
    }

    // 降级：正常小文件上传（时间戳命名）
    return normalUpload(file, folder, onProgress);
  }

  // ── 大文件（>5MB）分块上传，保持原有逻辑 ──

  // Create a concise fileId to avoid ENAMETOOLONG errors on OS level
  const nameStrs = Array.from(file.name).map(c => c.charCodeAt(0).toString(36)).join('').substring(0, 30);
  const fileId = `chunk_${nameStrs}_${file.size}_${file.lastModified}`;
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  // 1. Check uploaded chunks (Resume capability)
  const checkRes = await fetch(`/api/upload/chunk?fileId=${encodeURIComponent(fileId)}`);
  const { uploadedChunks = [] } = await checkRes.json();
  const uploadedSet = new Set<number>(uploadedChunks);

  // 2. Upload missing chunks with concurrency
  const CONCURRENCY = 3;
  let activePromises: Promise<void>[] = [];
  let completed = uploadedSet.size;

  if (onProgress) {
    onProgress(Math.round((completed / totalChunks) * 100));
  }

  for (let i = 0; i < totalChunks; i++) {
    if (uploadedSet.has(i)) continue;

    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    const task = async () => {
      const formData = new FormData();
      formData.append("fileId", fileId);
      formData.append("chunkIndex", i.toString());
      formData.append("chunk", chunk);
      formData.append("fileName", file.name);
      formData.append("fileType", file.type || "application/octet-stream");

      const res = await fetch("/api/upload/chunk", {
        method: "POST",
        body: formData
      });
      if (!res.ok) throw new Error(`Chunk ${i} upload failed`);
      
      completed++;
      if (onProgress) {
        const percent = Math.round((completed / totalChunks) * 95);
        onProgress(percent);
      }
    };

    const p = task();
    activePromises.push(p);

    p.then(() => {
      activePromises = activePromises.filter(curr => curr !== p);
    });

    if (activePromises.length >= CONCURRENCY) {
      await Promise.race(activePromises);
    }
  }

  await Promise.all(activePromises);

  if (onProgress) onProgress(98);

  // 3. Merge chunks
  const mergeRes = await fetch("/api/upload/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileId,
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      totalChunks,
      folder,
      useTimestamp: true 
    })
  });

  if (!mergeRes.ok) {
    const err = await mergeRes.json();
    throw new Error(err.error || "Merge failed");
  }

  if (onProgress) onProgress(100);

  return await mergeRes.json();
}

async function normalUpload(
  file: File,
  folder?: string,
  onProgress?: (percent: number) => void,
  overrideFileName?: string
) {
  const formData = new FormData();
  formData.append("file", file);

  if (onProgress) onProgress(30);

  const headers: Record<string, string> = {
    "x-folder": folder || "",
    "x-use-timestamp": overrideFileName ? "false" : "true",
  };
  if (overrideFileName) {
    headers["x-file-name"] = overrideFileName;
  }

  const res = await fetch("/api/upload", {
    method: "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || "服务器上传失败");
  }
  
  const data = await res.json();
  if (onProgress) onProgress(100);
  return data;
}
