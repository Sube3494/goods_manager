import { beforeEach, expect, mock, test } from "bun:test";
import { parseShopSortDraft, shopSortDraftFingerprint } from "../src/lib/shopSortDraft";
import { saveAccountShopSortDraft } from "../src/lib/shopSortDraftClient";

let user;
let shopOwner;
let failed;
const records = new Map();
const recordKey = (key) => `${key.userId}:${key.shopId}`;
mock.module("../src/lib/auth", () => ({ getAuthorizedUser: async () => user }));
mock.module("../src/lib/prisma", () => ({ default: {
  shop: { findFirst: async ({ where }) =>
    where.id === "shop-1" && (!where.userId || where.userId === shopOwner) ? { id: where.id } : null },
  shopSortDraft: {
    findUnique: async ({ where }) => {
      if (failed) throw new Error("database unavailable");
      const data = records.get(recordKey(where.userId_shopId));
      return data ? { data } : null;
    },
    upsert: async ({ create }) => {
      if (failed) throw new Error("database unavailable");
      records.set(recordKey(create), create.data);
      return { data: create.data };
    },
    createMany: async ({ data }) => {
      if (!records.has(recordKey(data[0]))) records.set(recordKey(data[0]), data[0].data);
    },
  },
} }));
const { GET, PUT } = await import("../src/app/api/shops/[id]/sort-draft/route");
const context = { params: Promise.resolve({ id: "shop-1" }) };
const draft = {
  startNumber: "N001", updatedAt: 123,
  categories: [{ id: "empty", name: "空分类", rangeSize: "60" }, { id: "toy", name: "玩具", rangeSize: "30" }],
  rows: ["item-2", "item-1"].map((id, index) => ({
    id, skuInput: `N00${index + 1}`, sortGroupNameInput: "玩具", sortCategoryNameInput: "玩具", sortExcluded: false,
  })),
};
const save = (value = draft, importOnly = false) => PUT(new Request("http://localhost/api/shops/shop-1/sort-draft", {
  method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft: value, importOnly }),
}), context);
const read = (origin = "https://example.com") => GET(new Request(`${origin}/api/shops/shop-1/sort-draft`), context);

beforeEach(() => {
  user = { id: "user-1", role: "USER" };
  shopOwner = "user-1";
  failed = false;
  records.clear();
});

test("同一账户跨域名、端口、HTTP 和 IPv6 读取完整排序记忆", async () => {
  expect((await save()).status).toBe(200);
  for (const origin of ["https://example.com", "http://example.com:18732", "http://[2001:db8::1]:18732"]) {
    const response = await read(origin);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await response.json()).draft).toEqual(draft);
  }
});

test("完整保存请求经过客户端、真实路由校验和存储后可再次读取", async () => {
  const previousFetch = globalThis.fetch;
  const fullDraft = { ...draft, rows: Array.from({ length: 356 }, (_, index) => ({ ...draft.rows[0], id: `item-${index}` })) };
  globalThis.fetch = (url, options) => PUT(new Request(`http://localhost${url}`, options), context);
  try {
    expect(await saveAccountShopSortDraft("shop-1", fullDraft)).toEqual(fullDraft);
    expect((await (await read()).json()).draft).toEqual(fullDraft);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("账户与店铺隔离，其他账户无权读写", async () => {
  await save();
  user = { id: "user-2", role: "USER" };
  expect((await read()).status).toBe(403);
  expect((await save()).status).toBe(403);
  expect(records.size).toBe(1);
});

test("超级管理员拥有独立的账户记忆", async () => {
  await save();
  user = { id: "admin", role: "SUPER_ADMIN" };
  expect((await (await read()).json()).draft).toBeNull();
  await save({ ...draft, startNumber: "A001" });
  expect(records.size).toBe(2);
  user = { id: "user-1", role: "USER" };
  expect((await (await read()).json()).draft.startNumber).toBe("N001");
});

test("未登录禁止访问", async () => {
  user = null;
  expect((await read()).status).toBe(403);
  expect((await save()).status).toBe(403);
});

test("旧草稿可导入空账户记录，但不能覆盖现有服务器记忆", async () => {
  await save(draft, true);
  await save({ ...draft, startNumber: "过期草稿" }, true);
  expect((await (await read()).json()).draft).toEqual(draft);
});

test("无效及重复行数据拒绝保存，不影响已有记忆", async () => {
  await save();
  expect((await save({ ...draft, rows: [draft.rows[0], draft.rows[0]] })).status).toBe(400);
  expect((await save({ ...draft, categories: [{}] })).status).toBe(400);
  expect((await (await read()).json()).draft).toEqual(draft);
});

test("数据库故障返回失败，不伪装为空记忆或保存成功", async () => {
  failed = true;
  expect((await read()).status).toBe(500);
  expect((await save()).status).toBe(500);
});

test("兼容旧草稿没有排除标记，保留空分类和编号区间", () => {
  const { sortExcluded: _excluded, ...legacyRow } = draft.rows[0];
  const parsed = parseShopSortDraft({ ...draft, rows: [legacyRow] });
  expect(parsed?.rows[0]).toEqual(legacyRow);
  expect(parsed?.categories).toEqual(draft.categories);
});

test("仅刷新读取时间不触发覆盖，手动顺序和区间变更可以识别", () => {
  const fingerprint = shopSortDraftFingerprint(draft);
  expect(shopSortDraftFingerprint({ ...draft, updatedAt: 999 })).toBe(fingerprint);
  expect(shopSortDraftFingerprint({ ...draft, rows: [...draft.rows].reverse() })).not.toBe(fingerprint);
  expect(shopSortDraftFingerprint({ ...draft, startNumber: "A001" })).not.toBe(fingerprint);
  expect(shopSortDraftFingerprint({ ...draft, categories: draft.categories.map(c => ({ ...c, rangeSize: "100" })) })).not.toBe(fingerprint);
});
