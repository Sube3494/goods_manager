"use client";

export type ClientPlatform = "ios" | "android" | "other";

type SaveFilePickerOptions = {
  suggestedName?: string;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
};

type SaveFilePickerHandle = {
  createWritable: () => Promise<{
    write: (data: Blob | File | ArrayBuffer | ArrayBufferView | string) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

function isSameOrigin(url: string) {
  if (typeof window === "undefined") return false;

  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

function stripUrlSuffix(url: string) {
  return url.split("#")[0].split("?")[0];
}

export function detectClientPlatform(): ClientPlatform {
  if (typeof navigator === "undefined") return "other";

  const userAgent = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const maxTouchPoints = navigator.maxTouchPoints || 0;

  const isIOS =
    /iPad|iPhone|iPod/.test(userAgent) ||
    (platform === "MacIntel" && maxTouchPoints > 1);

  if (isIOS) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}

export function inferFileExtensionFromUrl(url: string, fallback = "") {
  try {
    const resolved = new URL(url, typeof window !== "undefined" ? window.location.href : "http://localhost");
    const cleanPath = stripUrlSuffix(resolved.pathname);
    const ext = cleanPath.split(".").pop()?.trim().toLowerCase() || "";
    return ext || fallback;
  } catch {
    const cleanPath = stripUrlSuffix(url);
    const ext = cleanPath.split(".").pop()?.trim().toLowerCase() || "";
    return ext || fallback;
  }
}

function buildDownloadUrl(url: string, filename: string) {
  try {
    const resolved = new URL(url, window.location.href);

    if (isSameOrigin(resolved.toString()) && resolved.pathname.startsWith("/api/uploads/")) {
      resolved.searchParams.set("download", filename);
      resolved.searchParams.set("downloadedAt", buildClientLocalMetadataTimestamp());
      resolved.searchParams.set("downloadedOffset", buildClientTimezoneOffset());
    }

    return resolved.toString();
  } catch {
    return url;
  }
}

function buildClientLocalMetadataTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

function buildClientTimezoneOffset() {
  const offsetMinutes = -new Date().getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, "0");
  const minutes = String(absoluteMinutes % 60).padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

function inferMimeTypeFromFilename(filename: string) {
  const ext = filename.split(".").pop()?.trim().toLowerCase() || "";
  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

function buildSavePickerTypes(filename: string): SaveFilePickerOptions["types"] {
  const ext = filename.split(".").pop()?.trim().toLowerCase() || "";
  const mimeType = inferMimeTypeFromFilename(filename);
  if (!ext) {
    return [{
      description: "文件",
      accept: {
        [mimeType]: [],
      },
    }];
  }

  return [{
    description: "下载文件",
    accept: {
      [mimeType]: [`.${ext}`],
    },
  }];
}

async function saveFileWithPicker(file: File) {
  const pickerHost = window as typeof window & {
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<SaveFilePickerHandle>;
  };

  if (typeof pickerHost.showSaveFilePicker !== "function") {
    return false;
  }

  const handle = await pickerHost.showSaveFilePicker({
    suggestedName: file.name,
    types: buildSavePickerTypes(file.name),
  });
  const writable = await handle.createWritable();
  await writable.write(file);
  await writable.close();
  return true;
}

export function triggerBrowserDownload(url: string, filename: string) {
  const finalUrl = buildDownloadUrl(url, filename);
  const link = document.createElement("a");

  link.href = finalUrl;
  link.download = filename;
  link.rel = "noopener noreferrer";
  link.target = isSameOrigin(finalUrl) ? "_self" : "_blank";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = blobUrl;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

function buildDownloadFile(blob: Blob, filename: string) {
  return new File([blob], filename, {
    type: blob.type || undefined,
    lastModified: Date.now(),
  });
}

export async function triggerFetchedBlobDownload(url: string, filename: string) {
  const finalUrl = buildDownloadUrl(url, filename);
  const response = await fetch(finalUrl, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Download request failed: ${response.status}`);
  }

  const blob = await response.blob();
  const file = buildDownloadFile(blob, filename);
  try {
    const savedWithPicker = await saveFileWithPicker(file);
    if (savedWithPicker) {
      return;
    }
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) {
      console.warn("Save picker failed, falling back to browser download:", error);
    } else {
      return;
    }
  }

  triggerBlobDownload(file, filename);
}

export async function triggerIOSMediaShare(url: string, filename: string) {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return false;
  }

  if (typeof navigator.share !== "function") {
    return false;
  }

  try {
    const finalUrl = buildDownloadUrl(url, filename);
    const response = await fetch(finalUrl, { credentials: "include" });
    if (!response.ok) {
      return false;
    }

    const blob = await response.blob();
    const file = buildDownloadFile(blob, filename);

    const shareData = { files: [file], title: filename };
    const canShare = typeof navigator.canShare === "function" ? navigator.canShare(shareData) : true;
    if (!canShare) {
      return false;
    }

    await navigator.share(shareData);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return true;
    }
    return false;
  }
}
