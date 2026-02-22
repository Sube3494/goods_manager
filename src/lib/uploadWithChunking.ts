const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

export async function uploadFileWithChunking(
  file: File,
  folder?: string,
  onProgress?: (percent: number) => void
): Promise<{ url: string; type: string; skipped?: boolean; name?: string }> {

  // 1. Fetch Presign URL to determine upload strategy
  const presignRes = await fetch("/api/upload/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      folder,
      useTimestamp: true
    })
  });
  
  if (!presignRes.ok) {
     throw new Error("Failed to request upload configuration");
  }
  
  const presignData = await presignRes.json();
  
  // 2. Direct MinIO Upload using Presigned URL
  if (presignData.provider === "minio") {
      return new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", presignData.url, true);
          xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
          
          if (onProgress) {
             xhr.upload.onprogress = (e) => {
                 if (e.lengthComputable) {
                     onProgress(Math.round((e.loaded / e.total) * 100));
                 }
             };
          }
          
          xhr.onload = () => {
             if (xhr.status >= 200 && xhr.status < 300) {
                 const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(presignData.fileName);
                 if (onProgress) onProgress(100);
                 resolve({
                     url: presignData.publicUrl,
                     type: isVideo ? "video" : "image",
                     name: presignData.name 
                 });
             } else {
                 reject(new Error(`MinIO upload failed with status ${xhr.status}`));
             }
          };
          
          xhr.onerror = () => reject(new Error("Network error during MinIO upload"));
          
          xhr.send(file);
      });
  }

  // 3. Fallback to Local Storage

  // If small file, fallback to normal upload
  if (file.size <= CHUNK_SIZE) {
    return normalUpload(file, folder, onProgress);
  }

  // Create a concise fileId to avoid ENAMETOOLONG errors on OS level
  // We use a simplified base64-like string from char codes of the name
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

      const res = await fetch("/api/upload/chunk", {
        method: "POST",
        body: formData
      });
      if (!res.ok) throw new Error(`Chunk ${i} upload failed`);
      
      completed++;
      if (onProgress) {
        // Reserve last 5% for merge processing
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

  // Wait for the remaining uploads to finish
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

async function normalUpload(file: File, folder?: string, onProgress?: (percent: number) => void) {
  const formData = new FormData();
  formData.append("file", file);

  if (onProgress) onProgress(30);

  const res = await fetch("/api/upload", {
    method: "POST",
    headers: {
      "x-folder": folder || "",
      "x-use-timestamp": "true"
    },
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
