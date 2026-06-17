import { FinanceMath } from "@/lib/math";

type PurchaseCostItemInput = {
  quantity: number;
  costPrice: number;
};

type PurchaseCostSummaryInput = {
  items: PurchaseCostItemInput[];
  shippingFees?: number;
  extraFees?: number;
  discountAmount?: number;
};

export function getPurchaseShippingCostPerUnit(
  items: PurchaseCostItemInput[],
  shippingFees: number,
  extraFees = 0
) {
  const totalQuantity = items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
  if (totalQuantity <= 0) {
    return 0;
  }

  return FinanceMath.divide(
    FinanceMath.add(
      Math.max(0, Number(shippingFees) || 0),
      Math.max(0, Number(extraFees) || 0)
    ),
    totalQuantity
  );
}

export function allocateShippingToPurchaseItems<T extends PurchaseCostItemInput>(
  items: T[],
  shippingFees: number,
  extraFees = 0
) {
  const perUnitShippingCost = getPurchaseShippingCostPerUnit(items, shippingFees, extraFees);

  return items.map((item) => ({
    ...item,
    costPrice: FinanceMath.add(Number(item.costPrice) || 0, perUnitShippingCost),
  }));
}

export function calculatePurchaseOrderTotalAmount({
  items,
  shippingFees = 0,
  extraFees = 0,
  discountAmount = 0,
}: PurchaseCostSummaryInput) {
  const itemsTotal = items.reduce((sum, item) => {
    const quantity = Math.max(0, Number(item.quantity) || 0);
    const costPrice = Math.max(0, Number(item.costPrice) || 0);
    return FinanceMath.add(sum, FinanceMath.multiply(costPrice, quantity));
  }, 0);

  return Math.max(
    0,
    FinanceMath.add(
      FinanceMath.add(itemsTotal, Math.max(0, Number(shippingFees) || 0)),
      Math.max(0, Number(extraFees) || 0) - Math.max(0, Number(discountAmount) || 0)
    )
  );
}
