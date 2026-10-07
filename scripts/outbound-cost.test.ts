import assert from "node:assert/strict";
import { readRecordedCost, parseOutboundCostSnapshot, resolvePurchaseBatchSnapshotCost, getOrderCostStatusText } from "../src/lib/outboundCostSnapshot";

const resolve = (batches: unknown[], quantity = 2) => resolvePurchaseBatchSnapshotCost(parseOutboundCostSnapshot({ quantity, batches }), quantity);

assert.deepEqual(resolve([{ purchaseOrderItemId: "zero", quantity: 2, unitCost: 0 }]), { totalCost: 0, averageUnitCost: 0 });
assert.deepEqual(resolve([
  { purchaseOrderItemId: "zero", quantity: 1, unitCost: 0 },
  { purchaseOrderItemId: "paid", quantity: 1, unitCost: 12 },
]), { totalCost: 12, averageUnitCost: 6 });
for (const unitCost of [undefined, null, "", " ", -1, "bad", Infinity, false]) {
  assert.equal(readRecordedCost(unitCost), null);
  assert.equal(resolve([{ purchaseOrderItemId: "missing", quantity: 2, unitCost }]), null);
}
assert.equal(readRecordedCost("0"), 0);
assert.equal(resolve([{ purchaseOrderItemId: "short", quantity: 1, unitCost: 0 }]), null);
assert.equal(resolve([]), null);
assert.equal(resolvePurchaseBatchSnapshotCost(null, 2), null);
const manualZero = parseOutboundCostSnapshot({ quantity: 2, totalCost: 0, averageUnitCost: 0, batches: [], manualCostRecorded: true });
assert.deepEqual(resolvePurchaseBatchSnapshotCost(manualZero, 2), { totalCost: 0, averageUnitCost: 0 });
assert.equal(getOrderCostStatusText({ productCostStatus: "ready", missingCostItemCount: 0 }), "");
assert.equal(getOrderCostStatusText({ productCostStatus: "pending-outbound" }), "");
assert.equal(getOrderCostStatusText({ productCostStatus: "pending-backfill", missingCostItemCount: 1 }), "待补录");
assert.equal(getOrderCostStatusText({ productCostStatus: "pending-backfill", missingCostItemCount: 2 }), "待补录 2 项");
console.log("outbound cost tests passed (zero, missing, mixed, manual and capsule states)");
