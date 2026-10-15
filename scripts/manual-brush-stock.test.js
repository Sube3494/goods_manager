import { beforeEach, expect, mock, test } from "bun:test";
import { buildOutboundReturnMetaNote, filterCustomerReturns, parseOutboundReturnMeta } from "../src/lib/outboundReturnMeta";

let outbound;
let remaining;
let physicalStock;
const tx = {
  $queryRaw: async () => [],
  outboundOrder: {
    findFirst: async () => outbound,
    update: async ({ data }) => (outbound = { ...outbound, ...data }),
  },
  purchaseOrderItem: { update: async ({ data }) => { remaining += data.remainingQuantity.increment; } },
  productBatch: { updateMany: async ({ data }) => { physicalStock += data.remainingStock.increment; } },
};
mock.module("../src/lib/prisma", () => ({ default: { $transaction: async callback => callback(tx) } }));
mock.module("../src/services/inventoryService", () => ({ InventoryService: { syncStockFromBatches: async () => {} } }));
const { returnOutboundOrderById } = await import("../src/lib/outboundReturns");

beforeEach(() => {
  remaining = 1;
  physicalStock = 1;
  const previousReturn = { id: "previous", createdAt: "2026-10-15T01:00:00Z", reason: "顾客部分退货", refundAmount: 5, extraExpense: 0, returnedCost: 5,
    items: [{ outboundOrderItemId: "item-1", quantity: 1, batches: [{ purchaseOrderItemId: "batch-1", quantity: 1, unitCost: 5 }] }] };
  outbound = { id: "out-1", userId: "user-1", status: "PartialReturned", note: buildOutboundReturnMetaNote("平台单号: 1001", [previousReturn], "PartialReturned"),
    items: [{ id: "item-1", productId: "product-1", shopProductId: null, quantity: 3,
      costSnapshot: { quantity: 3, batches: [{ purchaseOrderItemId: "batch-1", quantity: 3, unitCost: 5 }] } }] };
});

test("刷单退库只归还未退的数量到原批次，重复操作不重复增加库存", async () => {
  const input = { reason: "手动标记刷单，自动回滚旧出库", skipAlreadyReturned: true };
  await returnOutboundOrderById("user-1", "out-1", input, tx);
  expect(remaining).toBe(3);
  expect(physicalStock).toBe(3);
  expect(outbound.status).toBe("Returned");
  const entries = parseOutboundReturnMeta(outbound.note).returns;
  expect(entries[1].items[0].quantity).toBe(2);
  expect(filterCustomerReturns(entries).length).toBe(1);
  await returnOutboundOrderById("user-1", "out-1", input, tx);
  expect(remaining).toBe(3);
  expect(physicalStock).toBe(3);
});
