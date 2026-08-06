import { AutoPickIntegrationConfig } from "@/lib/types";
import { buildShopDedupeKey, normalizeExternalId, normalizeShopNameKey } from "@/lib/shopIdentity";

export function readShopNameFromRawPayload(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }
  const record = rawPayload as Record<string, unknown>;
  const extend = record.extend && typeof record.extend === "object" && !Array.isArray(record.extend)
    ? record.extend as Record<string, unknown>
    : null;
  const candidates = [
    record.rawShopName,
    extend?.channel_name,
    record.channel_name,
    record.shop_name,
    record.shopName,
    record.storeName,
    record.merchantName,
    record.merchant_name,
  ];
  for (const item of candidates) {
    const value = String(item || "").trim();
    if (value) return value;
  }
  return null;
}

export function readShopAddressFromRawPayload(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }
  const record = rawPayload as Record<string, unknown>;
  const candidates = [
    record.rawShopAddress,
    record.shopAddress,
    record.storeAddress,
    record.merchantAddress,
    record.store_address,
    record.merchant_address,
  ];
  for (const item of candidates) {
    const value = String(item || "").trim();
    if (value) return value;
  }
  return null;
}

export function readShopIdFromRawPayload(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }
  const record = rawPayload as Record<string, unknown>;
  const delivery = record.delivery && typeof record.delivery === "object" && !Array.isArray(record.delivery)
    ? record.delivery as Record<string, unknown>
    : null;
  const candidates = [record.shop_id, delivery?.shop_id];
  for (const item of candidates) {
    const value = String(item || "").trim();
    if (value) return value;
  }
  return null;
}

export function resolveShopBrushCommission(
  config: AutoPickIntegrationConfig,
  shopInfo?: {
    maiyatianShopId?: string | null;
    shopName?: string | null;
    shopAddress?: string | null;
    localShopName?: string | null;
    rawPayload?: unknown;
  }
): number {
  const defaultCommission = config.defaultBrushCommission ?? 0;
  if (!config.maiyatianShopMappings || config.maiyatianShopMappings.length === 0) {
    return defaultCommission;
  }

  let maiyatianShopId = shopInfo?.maiyatianShopId || null;
  let shopName = shopInfo?.shopName || null;
  let shopAddress = shopInfo?.shopAddress || null;

  if (shopInfo?.rawPayload) {
    if (!maiyatianShopId) {
      maiyatianShopId = readShopIdFromRawPayload(shopInfo.rawPayload);
    }
    if (!shopName) {
      shopName = readShopNameFromRawPayload(shopInfo.rawPayload);
    }
    if (!shopAddress) {
      shopAddress = readShopAddressFromRawPayload(shopInfo.rawPayload);
    }
  }

  const normalizedShopId = normalizeExternalId(maiyatianShopId);
  if (normalizedShopId) {
    const matchedById = config.maiyatianShopMappings.find(
      (item) => String(item.maiyatianShopId || "").trim() === normalizedShopId
    );
    if (matchedById && typeof matchedById.brushCommission === "number" && matchedById.brushCommission >= 0) {
      return matchedById.brushCommission;
    }
  }

  const matchedByIdentity = config.maiyatianShopMappings.find((item) => {
    if (
      buildShopDedupeKey({
        name: item.maiyatianShopName,
        address: item.maiyatianShopAddress,
      }) &&
      buildShopDedupeKey({
        name: item.maiyatianShopName,
        address: item.maiyatianShopAddress,
      }) ===
        buildShopDedupeKey({
          name: shopName,
          address: shopAddress,
        })
    ) {
      return true;
    }

    return normalizeShopNameKey(item.maiyatianShopName) === normalizeShopNameKey(shopName);
  });

  if (matchedByIdentity && typeof matchedByIdentity.brushCommission === "number" && matchedByIdentity.brushCommission >= 0) {
    return matchedByIdentity.brushCommission;
  }

  if (shopInfo?.localShopName) {
    const matchedByLocal = config.maiyatianShopMappings.find(
      (item) => item.localShopName === shopInfo.localShopName
    );
    if (matchedByLocal && typeof matchedByLocal.brushCommission === "number" && matchedByLocal.brushCommission >= 0) {
      return matchedByLocal.brushCommission;
    }
  }

  return defaultCommission;
}
