import { beforeEach, expect, mock, test } from "bun:test";
import { parseOutboundCostSnapshot, resolvePurchaseBatchSnapshotCost } from "../src/lib/outboundCostSnapshot";

let savedSnapshot;
mock.module("../src/lib/auth", () => ({
  getFreshSession: async () => ({ id: "user-1" }),
  getAuthorizedUser: async () => ({ id: "user-1" }),
}));
mock.module("../src/lib/permissions", () => ({ hasPermission: () => true }));
mock.module("../src/lib/prisma", () => ({ default: {
  $transaction: async (callback) => callback({
    outboundOrderItem: {
      findUnique: async () => ({ id: "outbound-item-1", quantity: 2, outboundOrder: { userId: "user-1" } }),
      update: async ({ data }) => { savedSnapshot = data.costSnapshot; },
    },
  }),
} }));
const { POST } = await import("../src/app/api/purchases/backfill-cost/route");
const submit = (costPrice) => POST(new Request("http://localhost/api/purchases/backfill-cost", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ items: [{ outboundOrderItemId: "outbound-item-1", costPrice }] }),
}));
beforeEach(() => { savedSnapshot = null; });

test("saving explicit zero records a complete manual cost usable for profit calculation", async () => {
  expect((await submit(0)).status).toBe(200);
  expect(savedSnapshot.manualCostRecorded).toBe(true);
  expect(resolvePurchaseBatchSnapshotCost(parseOutboundCostSnapshot(savedSnapshot), 2)).toEqual({ totalCost: 0, averageUnitCost: 0 });
});
test("saving string zero also records zero without treating it as missing", async () => {
  expect((await submit("0")).status).toBe(200);
  expect(savedSnapshot.averageUnitCost).toBe(0);
});
test("blank or null costs cannot be silently saved as zero", async () => {
  for (const value of ["", null, undefined]) {
    expect((await submit(value)).status).toBe(500);
    expect(savedSnapshot).toBeNull();
  }
});
