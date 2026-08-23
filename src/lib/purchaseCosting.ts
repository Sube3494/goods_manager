import { FinanceMath } from "@/lib/math";

export type PurchaseCostItemInput = {
  id?: string;
  quantity: number;
  costPrice: number;
};

export type PurchaseCostSummaryInput = {
  items: PurchaseCostItemInput[];
  shippingFees?: number;
  extraFees?: number;
  discountAmount?: number;
};

/**
 * 按照货值金额比例平摊运费与额外费用
 * 如果整单商品总货值 > 0，则贵重商品按比例多分摊，低价商品少分摊；
 * 如果整单商品总货值 <= 0，则退化为按商品总件数机械均分；
 * 若无附加费用则直接返回原商品成本。
 */
export function allocateShippingToPurchaseItems<T extends PurchaseCostItemInput>(
  items: T[],
  shippingFees: number,
  extraFees = 0
): T[] {
  const totalAdditionalFees = FinanceMath.add(
    Math.max(0, Number(shippingFees) || 0),
    Math.max(0, Number(extraFees) || 0)
  );

  if (totalAdditionalFees <= 0 || items.length === 0) {
    return items.map((item) => ({
      ...item,
      costPrice: FinanceMath.add(Number(item.costPrice) || 0, 0),
    }));
  }

  // 1. 计算所有商品的有效总货值与总件数
  const totalItemValue = items.reduce((sum, item) => {
    const qty = Math.max(0, Number(item.quantity) || 0);
    const price = Math.max(0, Number(item.costPrice) || 0);
    return FinanceMath.add(sum, FinanceMath.multiply(price, qty));
  }, 0);

  const totalQuantity = items.reduce((sum, item) => {
    return sum + Math.max(0, Number(item.quantity) || 0);
  }, 0);

  // 2. 如果总货值 > 0，按货值金额比例分摊
  if (totalItemValue > 0) {
    return items.map((item) => {
      const qty = Math.max(0, Number(item.quantity) || 0);
      const baseCost = FinanceMath.add(Number(item.costPrice) || 0, 0);
      if (qty <= 0) {
        return { ...item, costPrice: baseCost };
      }

      const itemTotalValue = FinanceMath.multiply(baseCost, qty);
      // 该商品明细分摊的总附加费 = 总附加费 * (该明细货值 / 总货值)
      const allocatedTotalFee = FinanceMath.multiply(
        totalAdditionalFees,
        FinanceMath.divide(itemTotalValue, totalItemValue)
      );
      // 单位平摊附加费 = 该明细分摊总附加费 / 数量
      const perUnitAllocatedFee = FinanceMath.divide(allocatedTotalFee, qty);

      return {
        ...item,
        costPrice: FinanceMath.add(baseCost, perUnitAllocatedFee),
      };
    });
  }

  // 3. 如果总货值 <= 0（如单价全为0），按数量均分
  if (totalQuantity > 0) {
    const perUnitShippingCost = FinanceMath.divide(totalAdditionalFees, totalQuantity);
    return items.map((item) => ({
      ...item,
      costPrice: FinanceMath.add(Number(item.costPrice) || 0, perUnitShippingCost),
    }));
  }

  return items.map((item) => ({
    ...item,
    costPrice: FinanceMath.add(Number(item.costPrice) || 0, 0),
  }));
}

/**
 * 获取单位平摊运费（用于向下兼容单件平摊查看）
 */
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

/**
 * 计算采购单真实总金额:
 * 商品原价总额 + 运费 + 额外费用 - 优惠折扣
 */
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
