// Pages must be ordered by orderTime, then id, in ascending order.
export async function findEarliestMatchingDashboardOrder<T extends { id: string }>(
  readPage: (afterId: string | undefined, take: number) => Promise<T[]>,
  matches: (order: T) => boolean,
): Promise<T | null> {
  const pageSize = 200;
  let afterId: string | undefined;
  while (true) {
    const orders = await readPage(afterId, pageSize);
    const match = orders.find(matches);
    if (match) return match;
    if (orders.length < pageSize) return null;
    afterId = orders[orders.length - 1].id;
  }
}

export function createDashboardFirstOrderDateLookup<T extends { id: string; orderTime: Date }>(
  readOrderPage: (shopName: string, afterId: string | undefined, take: number) => Promise<T[]>,
  matches: (order: T, shopName: string) => boolean,
  normalizeShopName: (name: string) => string = (name) => name.trim(),
) {
  const cache = new Map<string, Promise<Date | null>>();
  return (shopName: string): Promise<Date | null> => {
    const key = normalizeShopName(shopName);
    const cached = cache.get(key);
    if (cached) return cached;
    // Only an order's orderTime establishes the operating start date.
    // Accounting dates from brush records, outbounds or purchases are not a fallback.
    const lookup = findEarliestMatchingDashboardOrder(
      (afterId, take) => readOrderPage(shopName, afterId, take),
      (order) => matches(order, shopName),
    ).then((order) => order?.orderTime ?? null);
    cache.set(key, lookup);
    return lookup;
  };
}
