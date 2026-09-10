const EXPIRED_MESSAGE = "麦芽田 Cookie 已失效，请重新登录麦芽田并更新 Cookie";

export function assertMaiyatianCookieResponse(response: Response, body: string) {
  const isLoginUrl = (value: string) => /\/(?:login|signin|sign-in|passport)(?:[/?#]|$)/i.test(value);
  const location = response.headers.get("location") || "";
  const loginForm = /<input\b[^>]*\btype\s*=\s*["']?password\b/i.test(body);
  const loginRedirect = /(?:window\.)?location(?:\.href)?\s*=\s*["'][^"']*\/(?:login|signin)(?:[/?#"'])/i.test(body);
  if (response.status === 401 || response.status === 403
    || isLoginUrl(response.url) || isLoginUrl(location) || loginForm || loginRedirect) {
    throw new Error(EXPIRED_MESSAGE);
  }
  if (!response.ok) {
    throw new Error(`麦芽田请求失败 ${response.status}`);
  }
  let data: Record<string, unknown> | null = null;
  try {
    data = JSON.parse(body);
  } catch {
    // The shop endpoint normally returns HTML.
  }
  if (data && typeof data === "object") {
    const message = String(data.message || data.msg || data.error || "");
    if (/未登录|请.*登录|登录.*(?:失效|过期)|cookie.*(?:失效|过期)|unauthorized|not logged in/i.test(message)) {
      throw new Error(EXPIRED_MESSAGE);
    }
    throw new Error("麦芽田未返回门店页面，无法确认 Cookie 是否有效");
  }
  if (!body.trim()) {
    throw new Error("麦芽田返回空页面，无法确认 Cookie 是否有效");
  }
}
