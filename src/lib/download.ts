"use client";

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

export async function triggerIOSMediaShare(url: string, filename: string) {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return false;
  }

  if (typeof navigator.share !== "function") {
    return false;
  }

  try {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) {
      return false;
    }

    const blob = await response.blob();
    const file = new File([blob], filename, {
      type: blob.type || undefined,
      lastModified: Date.now(),
    });

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
