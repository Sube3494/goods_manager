export type ParsedOutboundCostSnapshot = {
  quantity: number;
  totalCost: number;
  averageUnitCost: number;
  manualCostRecorded: boolean;
  batches: Array<{
    purchaseOrderItemId: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
  }>;
};

export function readRecordedCost(value: unknown): number | null {
  if (value == null || (typeof value !== "number" && typeof value !== "string")
    || (typeof value === "string" && !value.trim())) return null;
  const cost = Number(value);
  return Number.isFinite(cost) && cost >= 0 ? cost : null;
}

export function parseOutboundCostSnapshot(value: unknown): ParsedOutboundCostSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const batches: ParsedOutboundCostSnapshot["batches"] = [];
  for (const entry of Array.isArray(raw.batches) ? raw.batches : []) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const batch = entry as Record<string, unknown>;
    const purchaseOrderItemId = String(batch.purchaseOrderItemId || "").trim();
    const quantity = Number(batch.quantity);
    if (!purchaseOrderItemId || !Number.isFinite(quantity) || quantity <= 0) continue;
    batches.push({
      purchaseOrderItemId, quantity,
      // 保留缺失状态，不能将未填写隐式转为已填写的 0。
      unitCost: readRecordedCost(batch.unitCost) ?? Number.NaN,
      totalCost: readRecordedCost(batch.totalCost) ?? 0,
    });
  }
  return {
    quantity: Number(raw.quantity) || 0,
    totalCost: readRecordedCost(raw.totalCost) ?? 0,
    averageUnitCost: readRecordedCost(raw.averageUnitCost) ?? 0,
    manualCostRecorded: raw.manualCostRecorded === true && readRecordedCost(raw.averageUnitCost) !== null,
    batches,
  };
}

export function resolvePurchaseBatchSnapshotCost(snapshot: ParsedOutboundCostSnapshot | null, expectedQuantity: number) {
  const quantity = Math.max(0, Number(expectedQuantity) || 0);
  if (!snapshot || quantity <= 0) return null;
  if (snapshot.batches.length === 0) {
    return snapshot.manualCostRecorded
      ? { totalCost: snapshot.averageUnitCost * quantity, averageUnitCost: snapshot.averageUnitCost }
      : null;
  }
  const allocatedQuantity = snapshot.batches.reduce((sum, batch) => sum + batch.quantity, 0);
  if (allocatedQuantity + 1e-6 < quantity
    || snapshot.batches.some(batch => readRecordedCost(batch.unitCost) === null)) return null;
  const totalCost = snapshot.batches.reduce((sum, batch) => sum + batch.unitCost * batch.quantity, 0);
  return { totalCost, averageUnitCost: totalCost / allocatedQuantity };
}

export function getOrderCostStatusText(order: { productCostStatus?: string; missingCostItemCount?: number | null }) {
  if (order.productCostStatus !== "pending-backfill") return "";
  return Number(order.missingCostItemCount) > 1 ? `待补录 ${order.missingCostItemCount} 项` : "待补录";
}
