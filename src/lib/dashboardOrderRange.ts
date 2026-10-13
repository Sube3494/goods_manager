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
