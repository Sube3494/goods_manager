export function getMeituanOriginalImageUrl(value: string | null | undefined) {
  const input = String(value || "").trim();
  if (!input) return "";

  try {
    const url = new URL(input);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "http:" && url.protocol !== "https:") return input;
    if (hostname !== "meituan.net" && !hostname.endsWith(".meituan.net")) return input;

    url.pathname = url.pathname.replace(/^\/\d+(?:\.\d+)?\//, "/");
    return url.toString();
  } catch {
    return input;
  }
}
