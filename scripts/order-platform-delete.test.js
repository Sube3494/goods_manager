import { beforeEach, expect, mock, test } from "bun:test";

let saved;
let outboundQuery;
let outbounds;
let returned;
let cancelled;
let failReturn;
let events;
const tx = {
  user: { findUnique: async () => ({ permissions: {} }) },
  shop: { findMany: async () => [] },
  autoPickOrder: {
    findMany: async () => [saved],
    update: async ({ data }) => {
      const { items, ...fields } = data;
      saved = { ...saved, ...fields };
      return saved;
    },
  },
};
mock.module("../src/lib/prisma", () => ({ default: {
  ...tx,
  $transaction: async (callback) => callback(tx),
  autoPickOrder: { ...tx.autoPickOrder, findFirst: async () => saved },
  outboundOrder: { findMany: async (query) => { outboundQuery = query; return outbounds; } },
} }));
mock.module("../src/lib/autoPickOrderEvents", () => ({ emitAutoPickOrderEvent: (event) => events.push(event) }));
mock.module("../src/lib/autoPickAutoComplete", () => ({
  cancelAutoCompleteJob: async (...args) => cancelled.push(args),
}));
mock.module("../src/lib/outboundReturns", () => ({
  returnOutboundOrderById: async (...args) => {
    if (failReturn) throw new Error("return failed");
    returned.push(args);
    outbounds = outbounds.filter((outbound) => outbound.id !== args[1]);
  },
}));
const { deleteAutoPickOrderByIdentity, upsertAutoPickOrder, enrichAutoPickInboundOrderIfNeeded } = await import("../src/lib/autoPickOrders");

beforeEach(() => {
  saved = {
    id: "local-order", userId: "user-1", sourceId: "source-order", orderNo: "manual-31",
    platform: "线下交易", status: "已完成", userAddress: "测试路12号",
    createdAt: new Date("2026-10-01T00:00:00Z"), lastSyncedAt: new Date("2026-10-01T00:00:00Z"),
    autoCompleteAt: new Date(), rawPayload: { finished_time: "1790812800" }, items: [],
  };
  outbounds = [{ id: "outbound-1", note: "平台单号: manual-31 | 自动出库" },
    { id: "different-order", note: "平台单号: manual-310 | 自动出库" }];
  returned = []; cancelled = []; events = []; failReturn = false; outboundQuery = null;
});

for (const status of ["已完成", "已取消", "confirm"]) {
  test(`麦芽田删除${status}订单时作废、停止自动完成并回滚本账号的准确单号`, async () => {
    saved.status = status;
    const result = await deleteAutoPickOrderByIdentity("user-1", { sourceId: "source-order" });
    expect(result.deleted).toBe(true);
    expect(saved.status).toBe("已删除");
    expect(saved.autoCompleteAt).toBeNull();
    expect(outboundQuery.where.userId).toBe("user-1");
    expect(outboundQuery.where.status).toEqual({ not: "Returned" });
    expect(returned).toEqual([["user-1", "outbound-1", "平台订单删除自动回滚"]]);
    expect(cancelled).toEqual([["local-order", "platform-order-deleted"]]);
    expect(events.at(-1).type).toBe("delete");
  });
}

test("删除后收到撤回或完成的旧同步，订单仍为已删除且不再生成出库", async () => {
  await deleteAutoPickOrderByIdentity("user-1", { platform: "线下交易", orderNo: "manual-31" });
  for (const status of ["confirm", "delivery", "completed", "cancelled"]) {
    const result = await upsertAutoPickOrder("user-1", {
      id: "source-order", orderNo: "manual-31", platform: "线下交易",
      orderTime: "2026-10-01 08:00:00", status, userAddress: "测试路12号", actualPaid: 100,
      rawPayload: { finished_time: "1790812800" }, items: [{ productName: "测试商品", quantity: 1 }],
    });
    expect(result.status).toBe("已删除");
    expect(result.autoCompleteAt).toBeNull();
  }
  expect(returned).toHaveLength(1);
});

test("回滚失败后重试删除能继续清理，重复成功通知不重复退库", async () => {
  failReturn = true;
  await expect(deleteAutoPickOrderByIdentity("user-1", { sourceId: "source-order" })).rejects.toThrow("return failed");
  expect(saved.status).toBe("已删除");
  failReturn = false;
  await deleteAutoPickOrderByIdentity("user-1", { sourceId: "source-order" });
  await deleteAutoPickOrderByIdentity("user-1", { sourceId: "source-order" });
  expect(returned).toHaveLength(1);
});

test("删除通知不被详情补全覆盖，即使强制同步", async () => {
  const order = { status: "deleted" };
  expect(await enrichAutoPickInboundOrderIfNeeded("user-1", order, "test-session", { force: true })).toBe(order);
});

test("详情中的删除状态优先于残留的完成提示及退款记录", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => Response.json({ errno: 1, data:
    new URL(String(url)).pathname === "/cancel/detail/"
      ? [{ status: "1", title: "确认退款", total_price: 1 }]
      : { id: "source-order", status: "delete", tips: "订单完成", is_cancel: 1,
          fee: { user_fee: "100" }, goods: [] },
  });
  try {
    const order = { id: "source-order", status: "confirm", platform: "线下交易", actualPaid: 100 };
    const result = await enrichAutoPickInboundOrderIfNeeded("user-1", order, "test-session", { force: true });
    expect(result.status).toBe("已删除");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("找不到订单时删除不触发库存或任务操作", async () => {
  saved = null;
  expect(await deleteAutoPickOrderByIdentity("user-1", { sourceId: "missing" })).toEqual({ deleted: false, notFound: true });
  expect(returned).toHaveLength(0);
  expect(cancelled).toHaveLength(0);
});
