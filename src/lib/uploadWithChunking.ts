import imageCompression from "browser-image-compression";

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

export async function uploadFileWithChunking(
  file: File,
  folder?: string,
  onProgress?: (percent: number) => void
): Promise<{ url: string; path?: string; type: string; skipped?: boolean; name?: string }> {
  file = await maybeCompressImageBeforeUpload(file);

  // ── 去重预检：计算 SHA-256 后询问服务端是否已有相同文件 ──
  // 仅对小文件（非分块上传路径）做去重；大文件仍走分块上传
  if (file.size <= CHUNK_SIZE) {
    try {
      const hash = await computeFileSha256(file);
      const ext = file.name.split(".").pop() || "";

      const checkRes = await fetch("/api/upload/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hash,
          ext,
          fileName: file.name,
          fileType: file.type || "application/octet-stream",
          folder: folder || "gallery",
        }),
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
        // 统一走同源 /api/upload，由服务端再写入 MinIO / 本地存储，避免浏览器直传对象存储时随机报网络错误。
        const hashFileName = `${hash}.${ext}`;
        return normalUpload(file, folder, onProgress, hashFileName);
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
  const nameStrs = Array.from(file.name).map(c => c.charCodeAt(0).toString(36)).join("").substring(0, 30);
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
