"use client";

function isSameOrigin(url: string) {
  if (typeof window === "undefined") return false;

  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

function buildDownloadUrl(url: string, filename: string) {
  try {
    const resolved = new URL(url, window.location.href);

    if (isSameOrigin(resolved.toString()) && resolved.pathname.startsWith("/api/uploads/")) {
      resolved.searchParams.set("download", filename);
    }

    return resolved.toString();
  } catch {
    return url;
  }
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
