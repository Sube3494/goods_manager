import { expect, test } from "bun:test";
import { buildOutboundReturnMetaNote, repairBrushInventoryReturnNote, parseOutboundReturnMeta, filterCustomerReturns, getOutboundReturnedQuantityMap } from "../src/lib/outboundReturnMeta";

test("修复误记售后退款保留退库数量、批次和原始金额审计，重复执行无变化", () => {
  const entry = { id: "return-1", createdAt: "2026-10-15T10:23:50Z", reason: "售后退货", refundAmount: 181.6, extraExpense: 0, returnedCost: 42.2,
    items: [{ outboundOrderItemId: "item-1", quantity: 1, batches: [{ purchaseOrderItemId: "batch-1", quantity: 1, unitCost: 24.88 }] }] };
  const original = buildOutboundReturnMetaNote("平台单号: 1001", [entry], "Returned");
  const repaired = repairBrushInventoryReturnNote(original, "Returned");
  const parsed = parseOutboundReturnMeta(repaired);
  expect(filterCustomerReturns(parsed.returns)).toEqual([]);
  expect(parsed.returns[0].items).toEqual(parseOutboundReturnMeta(original).returns[0].items);
  expect(parsed.returns[0].reason).toContain("原登记退款：181.6");
  expect(parsed.returns[0].refundAmount).toBe(0);
  expect(parsed.returns[0].returnedCost).toBe(42.2);
  expect(getOutboundReturnedQuantityMap(parsed.returns).get("item-1")).toBe(1);
  expect(repairBrushInventoryReturnNote(repaired, "Returned")).toBe(repaired);
});
