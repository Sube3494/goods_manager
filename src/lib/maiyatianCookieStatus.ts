interface CookieConfig {
  maiyatianCookie: string;
  maiyatianCookies?: Array<{ enabled?: boolean; cookie: string }>;
}

export async function checkMaiyatianCookieStatus(
  config: CookieConfig,
  testConnection: (cookie: string) => Promise<{ ok: boolean }>,
): Promise<"missing" | "valid" | "partial" | "invalid"> {
  const cookies = (config.maiyatianCookies || [])
    .filter(account => account.enabled !== false && account.cookie.trim())
    .map(account => account.cookie);
  if (!cookies.length && config.maiyatianCookie.trim()) cookies.push(config.maiyatianCookie);
  if (!cookies.length) return "missing";
  const results = await Promise.allSettled(cookies.map(testConnection));
  const success = results.filter(result => result.status === "fulfilled" && result.value.ok).length;
  return success === cookies.length ? "valid" : success ? "partial" : "invalid";
}
