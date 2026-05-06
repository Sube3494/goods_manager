export type BrushDisplaySettings = {
  brushCommissionBoostEnabled: boolean;
};

type BrushDisplayOrder = {
  type: string;
  paymentAmount: number;
  receivedAmount: number;
  commission: number;
};

export function normalizeDisplayRate(value: number | null | undefined) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.06;
  if (numeric > 1) return numeric / 100;
  if (numeric < 0) return 0;
  return numeric;
}

export function resolvePlatformFeeRate(type: string) {
  if (type.includes("美团")) return normalizeDisplayRate(0.06);
  if (type.includes("淘宝")) return normalizeDisplayRate(0.06);
  if (type.includes("京东")) return normalizeDisplayRate(0.06);
  return 0.06;
}

export function getDisplayedMetrics(order: BrushDisplayOrder, _settings: BrushDisplaySettings, enabled: boolean) {
  if (!enabled) {
    return {
      payment: order.paymentAmount,
      received: order.receivedAmount,
      commission: order.commission,
      simulatedPlatformFee: 0,
    };
  }

  const rate = resolvePlatformFeeRate(order.type);
  const baseReceived = order.receivedAmount + order.commission + Math.max(0, order.paymentAmount - order.receivedAmount);
  const simulatedPayment = rate > 0 && rate < 1 ? baseReceived / (1 - rate) : baseReceived;
  const simulatedPlatformFee = Math.max(0, simulatedPayment - baseReceived);
  return {
    payment: simulatedPayment,
    received: baseReceived,
    commission: order.commission,
    simulatedPlatformFee,
  };
}

export function normalizeBrushSettlementPlatform(type: string) {
  if (type.includes("美团")) return "美团闪购";
  if (type.includes("京东")) return "京东秒送";
  if (type.includes("淘宝")) return "淘宝闪购";
  return type.trim();
}
