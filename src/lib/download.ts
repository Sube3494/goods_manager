"use client";

export type ClientPlatform = "ios" | "android" | "other";

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
    }

    return resolved.toString();
  } catch {
    return url;
  }
}

export async function convertWebpBlobToJpeg(blob: Blob): Promise<{ blob: Blob; isConverted: boolean }> {
  if (typeof window === "undefined") return { blob, isConverted: false };

  const isWebp = blob.type === "image/webp" || blob.type === "image/x-webp";
  if (!isWebp) return { blob, isConverted: false };

  try {
    const blobUrl = URL.createObjectURL(blob);
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = blobUrl;

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (err) => reject(err);
    });

    const canvas = document.createElement("canvas");
    canvas.width = img.width || 1200;
    canvas.height = img.height || 1200;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(blobUrl);
      return { blob, isConverted: false };
    }

    // 填充白色底色（防止白色变黑色透明底）
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    const jpegBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92);
    });

    URL.revokeObjectURL(blobUrl);

    if (jpegBlob) {
      return { blob: jpegBlob, isConverted: true };
    }
  } catch (error) {
    console.warn("Auto converting WebP to JPEG failed, using fallback:", error);
  }

  return { blob, isConverted: false };
}

function normalizeDownloadFilename(filename: string, isWebp = false): string {
  let name = filename || "download";
  if (isWebp || /\.webp$/i.test(name)) {
    if (/\.webp$/i.test(name)) {
      name = name.replace(/\.webp$/i, ".jpg");
    } else if (!/\.jpe?g$/i.test(name)) {
      name = `${name}.jpg`;
    }
  }
  return name;
}

export function triggerBrowserDownload(url: string, filename: string) {
  const isWebp = /\.webp$/i.test(filename) || inferFileExtensionFromUrl(url) === "webp";
  if (isWebp) {
    // 遇到 WebP 格式时，走 triggerFetchedBlobDownload 进行离线转码下载
    triggerFetchedBlobDownload(url, filename).catch(() => {
      const finalUrl = buildDownloadUrl(url, filename);
      const link = document.createElement("a");
      link.href = finalUrl;
      link.download = normalizeDownloadFilename(filename, true);
      link.rel = "noopener noreferrer";
      link.target = isSameOrigin(finalUrl) ? "_self" : "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
    return;
  }

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

export async function triggerFetchedBlobDownload(url: string, filename: string) {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Download request failed: ${response.status}`);
  }

  const rawBlob = await response.blob();
  const isWebpHint = rawBlob.type === "image/webp" || rawBlob.type === "image/x-webp" || /\.webp$/i.test(filename) || inferFileExtensionFromUrl(url) === "webp";

  let finalBlob = rawBlob;
  let targetFilename = filename;

  if (isWebpHint) {
    const { blob, isConverted } = await convertWebpBlobToJpeg(rawBlob);
    finalBlob = blob;
    targetFilename = normalizeDownloadFilename(filename, isConverted || isWebpHint);
  }

  triggerBlobDownload(finalBlob, targetFilename);
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

    const rawBlob = await response.blob();
    const isWebpHint = rawBlob.type === "image/webp" || rawBlob.type === "image/x-webp" || /\.webp$/i.test(filename) || inferFileExtensionFromUrl(url) === "webp";

    let finalBlob = rawBlob;
    let targetFilename = filename;

    if (isWebpHint) {
      const { blob, isConverted } = await convertWebpBlobToJpeg(rawBlob);
      finalBlob = blob;
      targetFilename = normalizeDownloadFilename(filename, isConverted || isWebpHint);
    }

    const file = new File([finalBlob], targetFilename, {
      type: finalBlob.type || "image/jpeg",
      lastModified: Date.now(),
    });

    const shareData = { files: [file], title: targetFilename };
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
