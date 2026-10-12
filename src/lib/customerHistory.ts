import prisma from "@/lib/prisma";
import { Prisma } from "../../prisma/generated-client";
import { ensureCustomerMemory } from "./customerMemoryStore";
import { CUSTOMER_MEMORY_PLATFORMS, getCustomerMemoryPlatform } from "./customerMemory";
import { extractCustomerPhoneTail } from "./customerPhoneTail";
import { resolveAutoPickMatchedShopName } from "./autoPickOrders";

export async function resolveCustomerHistoryScope(userId: string, currentOrderId: string, permissions?: unknown) {
  let currentOrder = await prisma.autoPickOrder.findFirst({ where: { userId, id: currentOrderId } });
  if (!currentOrder) return null;
  const platform = getCustomerMemoryPlatform(currentOrder.platform);
  const emptyWhere: Prisma.AutoPickOrderWhereInput = { userId, id: { in: [] } };
  if (platform) {
    await ensureCustomerMemory(userId);
    currentOrder = await prisma.autoPickOrder.findFirst({ where: { userId, id: currentOrderId } });
    if (!currentOrder) return null;
    const where: Prisma.AutoPickOrderWhereInput = currentOrder.customerIdentityKey ? {
      userId,
      platform: { in: CUSTOMER_MEMORY_PLATFORMS.filter((value) => getCustomerMemoryPlatform(value) === platform), mode: "insensitive" },
      customerIdentityKey: currentOrder.customerIdentityKey,
    } : emptyWhere;
    return { currentOrder, where, matchBasis: "同门店、同平台、真实尾号＋详细地址" };
  }

  const tail = extractCustomerPhoneTail(currentOrder);
  const shopName = resolveAutoPickMatchedShopName(currentOrder, permissions);
  if (!tail || (!currentOrder.shopId && !shopName)) {
    return { currentOrder, where: emptyWhere, matchBasis: "同门店、同平台、真实手机尾号" };
  }
  const candidates = await prisma.autoPickOrder.findMany({
    where: { userId, platform: currentOrder.platform },
    select: { id: true, shopId: true, rawPayload: true },
  });
  const ids = candidates.filter((order) => extractCustomerPhoneTail(order) === tail && (
    Boolean(currentOrder.shopId && order.shopId === currentOrder.shopId)
    || Boolean(shopName && resolveAutoPickMatchedShopName(order, permissions) === shopName)
  )).map((order) => order.id);
  return { currentOrder, where: { userId, id: { in: ids } }, matchBasis: "同门店、同平台、真实手机尾号" };
}
