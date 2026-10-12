import { createHash } from "node:crypto";
import prisma from "@/lib/prisma";
import { CUSTOMER_MEMORY_PLATFORMS, CustomerMemoryOrder, getCustomerMemoryIdentity, getCustomerMemoryParts, getCustomerMemoryPlatform } from "./customerMemory";

export const CUSTOMER_IDENTITY_VERSION = 2;

export function buildCustomerMemoryFields(order: CustomerMemoryOrder) {
  const identity = getCustomerMemoryIdentity(order);
  const parts = getCustomerMemoryParts(order);
  return {
    customerIdentityVersion: CUSTOMER_IDENTITY_VERSION,
    customerIdentityKey: identity ? createHash("sha256").update(JSON.stringify(identity)).digest("hex") : null,
    customerPhoneTail: parts?.phoneTail || null,
    customerAddressKey: parts?.addressKey || null,
    customerShopKey: parts?.shopKey || null,
  };
}

// 历史订单仅补算一次；同步直接写入索引，不在每次列表请求中扫描所有历史订单。
const backfills = new Map<string, Promise<void>>();
export async function ensureCustomerMemory(userId: string) {
  const active = backfills.get(userId);
  if (active) return active;
  const pending = (async () => {
    for (;;) {
      const orders = await prisma.autoPickOrder.findMany({
        where: { userId, platform: { in: CUSTOMER_MEMORY_PLATFORMS, mode: "insensitive" }, customerIdentityVersion: { lt: CUSTOMER_IDENTITY_VERSION } },
        take: 200,
        select: { id: true, platform: true, shopId: true, userAddress: true, rawPayload: true, updatedAt: true, customerIdentityVersion: true,
          customerPhoneTail: true, customerAddressKey: true, customerShopKey: true },
      });
      if (!orders.length) break;
      await prisma.$transaction(orders.map((order) => prisma.autoPickOrder.updateMany({
        // 与同步并发时，不用旧载荷覆盖刚更新的顾客标识。
        where: { id: order.id, userId, customerIdentityVersion: order.customerIdentityVersion, updatedAt: order.updatedAt },
        data: buildCustomerMemoryFields(order),
      })));
    }
  })();
  backfills.set(userId, pending);
  try { await pending; } finally { if (backfills.get(userId) === pending) backfills.delete(userId); }
}

export async function resolveRememberedCustomerTypes(userId: string, orders: CustomerMemoryOrder[]) {
  const supported = orders.filter((order) => getCustomerMemoryPlatform(order.platform));
  const result = new Map<string, "new" | "returning">();
  if (!supported.length) return result;
  await ensureCustomerMemory(userId);
  const ids = supported.map((order) => order.id).filter((id): id is string => Boolean(id));
  const stored = await prisma.autoPickOrder.findMany({
    where: { userId, id: { in: ids } }, select: { id: true, customerIdentityKey: true },
  });
  const keys = [...new Set(stored.map((order) => order.customerIdentityKey).filter((key): key is string => Boolean(key)))];
  const firstOrders = keys.length ? await prisma.autoPickOrder.findMany({
    where: { userId, customerIdentityKey: { in: keys } },
    distinct: ["customerIdentityKey"],
    orderBy: [{ orderTime: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, customerIdentityKey: true },
  }) : [];
  const firstIds = new Map(firstOrders.map((order) => [order.customerIdentityKey, order.id]));
  for (const order of supported) result.set(order.id || "", "new");
  for (const order of stored) {
    const firstId = order.customerIdentityKey ? firstIds.get(order.customerIdentityKey) : null;
    result.set(order.id, firstId && firstId !== order.id ? "returning" : "new");
  }
  return result;
}
