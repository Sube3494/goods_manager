import { beforeEach, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { getCustomerMemoryIdentity, normalizeCustomerMemoryAddress, readCustomerMemoryPhoneTail } from "../src/lib/customerMemory";
import { extractCustomerPhoneTail } from "../src/lib/customerPhoneTail";

let rows = [];
let updates = 0;
let historyQueries = [];
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && "in" in value) {
      return value.in.some((candidate) => value.mode === "insensitive"
        ? String(candidate).toLowerCase() === String(row[key]).toLowerCase() : candidate === row[key]);
    }
    return row[key] === value;
  });
}
function query({ where, select, orderBy, distinct, take, include }) {
  if (include?.items) historyQueries.push(where);
  let result = rows.filter((row) => matches(row, where));
  if (orderBy) {
    const rules = Array.isArray(orderBy) ? orderBy : [orderBy];
    result.sort((a, b) => {
      for (const rule of rules) {
        const [key, direction] = Object.entries(rule)[0];
        const delta = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
        if (delta) return direction === "desc" ? -delta : delta;
      }
      return 0;
    });
  }
  if (distinct) {
    const seen = new Set();
    result = result.filter((row) => {
      const key = JSON.stringify(distinct.map((field) => row[field]));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  if (take) result = result.slice(0, take);
  return result.map((row) => select
    ? Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])) : { ...row });
}
mock.module("../src/lib/prisma", () => ({ default: {
  autoPickOrder: {
    findMany: async (args) => query(args),
    findFirst: async (args) => query(args)[0] || null,
    updateMany: async ({ where, data }) => {
      let count = 0;
      for (const row of rows) if (matches(row, where)) { Object.assign(row, data); count++; updates++; }
      return { count };
    },
  },
  user: { findUnique: async () => ({ permissions: {} }) },
  $transaction: async (operations) => Promise.all(operations),
} }));
mock.module("../src/lib/auth", () => ({ getAuthorizedUser: async () => ({ id: "user-1" }) }));
mock.module("../src/lib/autoPickOrders", () => ({ resolveAutoPickMatchedShopName: () => "测试门店" }));
const { buildCustomerMemoryFields, resolveRememberedCustomerTypes } = await import("../src/lib/customerMemoryStore");
const { GET: getHistory } = await import("../src/app/api/orders/customer-history/route");

function order(id, overrides = {}) {
  return { id, userId: "user-1", platform: "京东", shopId: "shop-1", orderNo: id,
    orderTime: new Date("2026-10-12T01:00:00Z"), createdAt: new Date("2026-10-12T01:00:00Z"),
    userAddress: "测试市测试路12号1栋101室", rawPayload: { secret_phone: "138****1234" },
    customerIdentityVersion: 0, customerIdentityKey: null, customerPhoneTail: null, customerAddressKey: null, customerShopKey: null,
    actualPaid: 14800, expectedIncome: 14060, items: [], ...overrides };
}
beforeEach(() => { rows = []; updates = 0; historyQueries = []; });

test("真实尾号优先，虚拟号和分机号不能识别顾客", () => {
  expect(readCustomerMemoryPhoneTail(order("a"))).toBe("1234");
  expect(readCustomerMemoryPhoneTail(order("a", { rawPayload: { unencrypted_phone: "13812345678" } }))).toBe("5678");
  for (const rawPayload of [{ phone: "13812345678" }, { secret_phone: "13812345678_1234" }, { secret_phone: "138****1234#55" }]) {
    expect(readCustomerMemoryPhoneTail(order("a", { rawPayload }))).toBeNull();
    expect(extractCustomerPhoneTail(order("a", { rawPayload }))).toBeNull();
  }
});

test("地址只归一格式，房号和数字间的连字符始终保留", () => {
  expect(normalizeCustomerMemoryAddress("测试市 测试路１２号，１栋１０１室")).toBe(normalizeCustomerMemoryAddress(order("a").userAddress));
  expect(normalizeCustomerMemoryAddress("测试市测试路1-2号101室")).not.toBe(normalizeCustomerMemoryAddress("测试市测试路12号101室"));
  for (const address of ["测试小区", "地址不详", "测试市测试路***号", "到店自取"]) expect(normalizeCustomerMemoryAddress(address)).toBeNull();
});

test("平台、门店、地址都隔离，只有尾号相同不会合并", () => {
  const key = buildCustomerMemoryFields(order("a")).customerIdentityKey;
  for (const change of [{ platform: "淘宝" }, { shopId: "shop-2" }, { userAddress: "测试市测试路12号1栋102室" }, { rawPayload: { secret_phone: "138****5678" } }]) {
    expect(buildCustomerMemoryFields(order("b", change)).customerIdentityKey).not.toBe(key);
  }
  expect(getCustomerMemoryIdentity(order("a", { shopId: null }))).toBeNull();
  expect(buildCustomerMemoryFields(order("a", { platform: "美团" })).customerIdentityKey).toBeNull();
});

test("刷单、取消、退款都计入历史，列表分页不会把老客变成新客", async () => {
  rows = [order("first", { status: "已取消", orderTime: new Date("2026-10-01T01:00:00Z") }),
    order("refund", { status: "全额退款" }),
    order("brush", { rawPayload: { secret_phone: "138****1234", systemMeta: { mainSystemSelfDelivery: { triggered: true } } } }),
    order("taobao", { platform: "淘宝" }), order("other-shop", { shopId: "shop-2" }),
    order("other-address", { userAddress: "测试市测试路12号1栋102室" }),
    order("other-user", { userId: "user-2", orderTime: new Date("2020-01-01T00:00:00Z") })];
  const types = await resolveRememberedCustomerTypes("user-1", [rows[1], rows[2], rows[3], rows[4], rows[5]]);
  expect(types.get("refund")).toBe("returning");
  expect(types.get("brush")).toBe("returning");
  expect(types.get("taobao")).toBe("new");
  expect(types.get("other-shop")).toBe("new");
  expect(types.get("other-address")).toBe("new");
  expect(updates).toBe(6);
  await resolveRememberedCustomerTypes("user-1", [rows[1]]);
  expect(updates).toBe(6);
});

test("重复同步不改变首单，补入更早订单后按下单时间重新判定", async () => {
  rows = [order("a")];
  expect((await resolveRememberedCustomerTypes("user-1", rows)).get("a")).toBe("new");
  expect((await resolveRememberedCustomerTypes("user-1", rows)).get("a")).toBe("new");
  rows.push(order("older", { orderTime: new Date("2026-09-01T00:00:00Z") }));
  const types = await resolveRememberedCustomerTypes("user-1", rows);
  expect(types.get("a")).toBe("returning");
  expect(types.get("older")).toBe("new");
});

test("同期两笔不同订单也只有一个首单，稳定用创建时间和ID排序", async () => {
  rows = [order("b"), order("a")];
  const types = await resolveRememberedCustomerTypes("user-1", rows);
  expect(types.get("a")).toBe("new");
  expect(types.get("b")).toBe("returning");
});

test("缺少资料没有匹配记录也标新客，同步漏回电话时保留已记住的尾号", async () => {
  rows = [order("missing", { rawPayload: {} }), order("address", { userAddress: "测试小区" })];
  const types = await resolveRememberedCustomerTypes("user-1", rows);
  expect(types.get("missing")).toBe("new");
  expect(types.get("address")).toBe("new");
  const remembered = buildCustomerMemoryFields(order("a"));
  expect(buildCustomerMemoryFields({ ...order("a"), ...remembered, rawPayload: {} })).toEqual(remembered);
});

test("老客弹窗只返回同账号同店同平台同尾号同地址，含所有状态", async () => {
  rows = [order("current"), order("cancelled", { status: "已取消" }), order("refunded", { status: "退款成功" }),
    order("taobao", { platform: "淘宝" }), order("other-address", { userAddress: "测试市测试路12号1栋102室" }),
    order("other-shop", { shopId: "shop-2" }), order("other-user", { userId: "user-2" })];
  const response = await getHistory(new NextRequest("http://localhost/api/orders/customer-history?phoneTail=1234&currentOrderId=current"));
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.orders.map((row) => row.id).sort()).toEqual(["cancelled", "current", "refunded"]);
  expect(data.matchBasis).toContain("详细地址");
  expect(historyQueries[0].customerIdentityKey).toBe(rows[0].customerIdentityKey);
});

test("无法识别不降级为宽泛尾号搜索，不能跨账号读取当前订单", async () => {
  rows = [order("missing", { userAddress: "测试小区" }), order("same-tail"), order("foreign", { userId: "user-2" })];
  const missing = await getHistory(new NextRequest("http://localhost/api/orders/customer-history?phoneTail=1234&currentOrderId=missing"));
  expect((await missing.json()).orders).toEqual([]);
  const forbidden = await getHistory(new NextRequest("http://localhost/api/orders/customer-history?phoneTail=1234&currentOrderId=foreign"));
  expect(forbidden.status).toBe(404);
});
