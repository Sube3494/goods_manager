const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

export async function uploadFileWithChunking(
  file: File,
  folder?: string,
  onProgress?: (percent: number) => void
): Promise<{ url: string; type: string; skipped?: boolean }> {
  // If small file, fallback to normal upload
  if (file.size <= CHUNK_SIZE) {
    return normalUpload(file, folder, onProgress);
  }

  const fileId = `${encodeURIComponent(file.name)}-${file.size}-${file.lastModified}`;
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
  const arrayBuffer = await file.arrayBuffer();
  
  if (onProgress) onProgress(50);

  const res = await fetch("/api/upload", {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name),
      "X-File-Type": file.type,
      "x-folder": folder || ""
    },
    body: arrayBuffer,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || "服务器上传失败");
  }
  
  const data = await res.json();
  if (onProgress) onProgress(100);
  return data;
}
