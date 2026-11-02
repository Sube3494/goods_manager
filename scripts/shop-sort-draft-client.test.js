import { afterEach, expect, test } from "bun:test";
import { saveAccountShopSortDraft } from "../src/lib/shopSortDraftClient";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const draft = {
  startNumber: "N001", updatedAt: 123,
  categories: [{ id: "toy", name: "玩具", rangeSize: "60" }],
  rows: Array.from({ length: 356 }, (_, index) => ({
    id: `item-${index}`, skuInput: `N${index}`, sortExcluded: false,
    sortGroupNameInput: "玩具", sortCategoryNameInput: "玩具",
  })),
};

test("356 件商品的完整排序通过普通请求保存，并验证服务器确认内容", async () => {
  globalThis.fetch = async (url, options) => {
    expect(url).toBe("/api/shops/shop-1/sort-draft");
    expect(options.keepalive).toBeUndefined();
    expect(options.credentials).toBe("same-origin");
    expect(JSON.parse(options.body).draft).toEqual(draft);
    return Response.json({ draft });
  };
  expect(await saveAccountShopSortDraft("shop-1", draft)).toEqual(draft);
});

test("失败后可重试同一份排序，服务器错误及状态码会保留", async () => {
  globalThis.fetch = async () => Response.json({ error: "排序记忆表未就绪" }, { status: 503 });
  await expect(saveAccountShopSortDraft("shop-1", draft)).rejects.toThrow("排序记忆表未就绪（HTTP 503）");
  globalThis.fetch = async () => Response.json({ draft });
  expect(await saveAccountShopSortDraft("shop-1", draft)).toEqual(draft);
});

test("代理返回登录 HTML、空确认或不同排序都不能误报保存成功", async () => {
  for (const response of [new Response("<html>Login</html>"), Response.json({ draft: null }), Response.json({ draft: { ...draft, rows: [...draft.rows].reverse() } })]) {
    globalThis.fetch = async () => response;
    await expect(saveAccountShopSortDraft("shop-1", draft)).rejects.toThrow();
  }
});

test("浏览器拒绝发送请求时提供重试提示，不改变原排序", async () => {
  const before = JSON.stringify(draft);
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  await expect(saveAccountShopSortDraft("shop-1", draft)).rejects.toThrow("请点击重试保存");
  expect(JSON.stringify(draft)).toBe(before);
});
