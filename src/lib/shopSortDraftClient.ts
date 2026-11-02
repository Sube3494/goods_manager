import { parseShopSortDraft, shopSortDraftFingerprint, type ShopSortDraft } from "./shopSortDraft";

export async function saveAccountShopSortDraft(shopId: string, draft: ShopSortDraft) {
  let response: Response;
  try {
    response = await fetch(`/api/shops/${encodeURIComponent(shopId)}/sort-draft`, {
      method: "PUT", credentials: "same-origin",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft }),
      // 完整草稿不使用 keepalive，避免耗尽浏览器共享的后台请求额度。
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error("保存请求超时，当前排序仍保留在窗口中，请点击重试保存");
    }
    throw new Error("保存请求未能完成，当前排序仍保留在窗口中，请点击重试保存");
  }
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const error = result && typeof result.error === "string" ? result.error : "服务器未能保存排序记忆";
    throw new Error(`${error}（HTTP ${response.status}）`);
  }
  const saved = parseShopSortDraft(result?.draft);
  if (!saved) throw new Error("服务器没有返回有效的保存结果，当前排序仍保留，请重试保存");
  if (shopSortDraftFingerprint(saved) !== shopSortDraftFingerprint(draft)) {
    throw new Error("服务器返回的排序与当前排序不一致，尚未确认保存，请重试");
  }
  return saved;
}
