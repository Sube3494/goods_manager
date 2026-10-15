import { beforeEach, expect, mock, test } from "bun:test";

const address = "测试市测试路12号1栋101室";
const hidden = "为保护用户隐私，根据小时达平台要求，订单完成/取消后将不支持地址信息查看";
let saved;
let selectedFields;
const tx = {
  user: { findUnique: async () => ({ permissions: {} }) },
  shop: { findMany: async () => [] },
  autoPickOrder: {
    findMany: async ({ select }) => { selectedFields = select; return [saved]; },
    update: async ({ data }) => { const { items, ...fields } = data; saved = { ...saved, ...fields }; return saved; },
  },
};
mock.module("../src/lib/prisma", () => ({ default: {
  ...tx, $transaction: async (callback) => callback(tx),
  autoPickOrder: { findFirst: async () => null },
  outboundOrder: { findMany: async () => [] },
} }));
mock.module("../src/lib/autoPickOrderEvents", () => ({ emitAutoPickOrderEvent() {} }));
const { upsertAutoPickOrder } = await import("../src/lib/autoPickOrders");
const { buildCustomerMemoryFields } = await import("../src/lib/customerMemoryStore");
const { readMainSystemSelfDeliveryFlag } = await import("../src/lib/autoPickOrderStatus");
const { getOrderGroup } = await import("../src/lib/orderGroups");

beforeEach(() => {
  saved = { id: "local-order", userId: "user-1", sourceId: "source-order", orderNo: "order-31",
    platform: "抖店", shopId: "shop-1", status: "completed", userAddress: address,
    createdAt: new Date("2026-10-01T00:00:00Z"), lastSyncedAt: new Date("2026-10-01T00:00:00Z"),
    rawPayload: { userAddress: address, secret_phone: "138****1234" }, items: [] };
  Object.assign(saved, buildCustomerMemoryFields(saved));
});

for (const status of ["completed", "cancelled"]) {
  test(`抖店${status}同步写库保留真实地址和顾客标识，并更新新状态与实付`, async () => {
    saved.status = "delivering";
    const identity = saved.customerIdentityKey;
    const result = await upsertAutoPickOrder("user-1", {
      id: "source-order", orderNo: "order-31", platform: "抖店", shopId: "shop-1",
      orderTime: "2026-10-01 08:00:00", userAddress: hidden, status, actualPaid: 16200,
      rawPayload: { userAddress: hidden, status, actualPaid: 16200 },
      items: [{ productName: "巧克力", quantity: 1 }],
    });
    expect(selectedFields.userAddress).toBe(true);
    expect(result.userAddress).toBe(address);
    expect(result.rawPayload.userAddress).toBe(address);
    expect(result.rawPayload.secret_phone).toBe("138****1234");
    expect(result.status).toBe(status);
    expect(result.actualPaid).toBe(16200);
    expect(result.customerIdentityKey).toBe(identity);
    expect(result.customerPhoneTail).toBe("1234");
  });
}

test("手工刷单标记在多次第三方配送同步后仍保留，配送信息不被改成自配", async () => {
  saved.rawPayload.systemMeta = { mainSystemSelfDelivery: { triggered: true, manuallyMarked: true } };
  const delivery = { logisticName: "闪送", dispatcher: "rider-1", sendFee: 1280 };
  for (let index = 0; index < 3; index++) {
    const result = await upsertAutoPickOrder("user-1", {
      id: "source-order", orderNo: "order-31", platform: "抖店", shopId: "shop-1",
      orderTime: "2026-10-01 08:00:00", status: "completed", actualPaid: 16200,
      delivery, userAddress: address, rawPayload: { delivery }, items: [{ productName: "巧克力", quantity: 1 }],
    });
    expect(result.rawPayload.systemMeta.mainSystemSelfDelivery.triggered).toBe(true);
    expect(result.delivery.logisticName).toBe("闪送");
    expect(result.delivery.sendFee).toBe(1280);
    expect(readMainSystemSelfDeliveryFlag(result.rawPayload, result.delivery)).toBe(true);
    expect(getOrderGroup(result, readMainSystemSelfDeliveryFlag(result.rawPayload, result.delivery))).toBe("brush");
  }
});

test("真正自配的过期标记仍可由第三方运力覆盖", async () => {
  saved.rawPayload.systemMeta = { mainSystemSelfDelivery: { triggered: true, triggeredAt: "2020-01-01T00:00:00Z" } };
  const delivery = { logisticName: "闪送", dispatcher: "rider-1" };
  const result = await upsertAutoPickOrder("user-1", {
    id: "source-order", orderNo: "order-31", platform: "抖店", shopId: "shop-1",
    orderTime: "2026-10-01 08:00:00", status: "completed", delivery, userAddress: address, rawPayload: { delivery }, items: [{ productName: "巧克力", quantity: 1 }],
  });
  expect(result.rawPayload.systemMeta.mainSystemSelfDelivery.triggered).toBe(false);
  expect(readMainSystemSelfDeliveryFlag(result.rawPayload, result.delivery)).toBe(false);
});
