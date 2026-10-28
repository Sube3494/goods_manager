import prisma from "@/lib/prisma";

// Keep authorization tied to the operator, but run order mutations in the owner's scope.
export async function resolveOrderOperatorScope<T extends { id: string; role?: string | null }>(
  operator: T,
  orderId: string,
): Promise<T | null> {
  const order = await prisma.autoPickOrder.findFirst({
    where: { id: orderId, ...(operator.role === "SUPER_ADMIN" ? {} : { userId: operator.id }) },
    select: { userId: true },
  });
  return order ? { ...operator, id: order.userId } : null;
}
