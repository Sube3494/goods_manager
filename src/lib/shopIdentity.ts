export type ShopIdentityInput = {
  externalId?: unknown;
  name?: unknown;
  address?: unknown;
};

export type ShopIdentityRecord = {
  id?: string;
  externalId?: string | null;
  name?: string | null;
  address?: string | null;
};

export function normalizeExternalId(value: unknown) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function normalizeDisplayText(value: unknown) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparableToken(value: unknown) {
  return normalizeDisplayText(value)
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9]+/gi, "");
}

export function simplifyShopName(name: string) {
  const normalized = normalizeDisplayText(name);
  if (!normalized) return "";

  const match = normalized.match(/[\(（](.*)[\)）]$/);
  if (match?.[1]) return normalizeDisplayText(match[1]);

  const parts = normalized
    .replace(/^私人订制轻奢礼品店/, "")
    .split(/[^\u4e00-\u9fa5a-zA-Z0-9]+/)
    .filter(Boolean);
  const lastPart = parts.pop() || "";
  if (lastPart === "店" && parts.length > 0) {
    return normalizeDisplayText((parts.pop() || "") + lastPart);
  }

  return normalizeDisplayText(
    lastPart.replace(/(生日礼物|儿童玩具|滋补燕窝|礼品店)/g, "").trim() || normalized
  );
}

export function normalizeShopName(value: unknown) {
  const displayName = normalizeDisplayText(value);
  return simplifyShopName(displayName || "");
}

export function normalizeShopNameKey(value: unknown) {
  return normalizeComparableToken(normalizeShopName(value));
}

export function normalizeShopAddress(value: unknown) {
  return normalizeDisplayText(value);
}

export function normalizeShopAddressKey(value: unknown) {
  return normalizeComparableToken(normalizeShopAddress(value));
}

export function buildShopDedupeKey(input: ShopIdentityInput) {
  const nameKey = normalizeShopNameKey(input.name);
  const addressKey = normalizeShopAddressKey(input.address);
  if (nameKey && addressKey) return `${nameKey}::${addressKey}`;
  return nameKey || addressKey || "";
}

export function findMatchingShopRecord<T extends ShopIdentityRecord>(
  shops: T[],
  target: ShopIdentityInput
) {
  const externalId = normalizeExternalId(target.externalId);
  if (externalId) {
    const matchedByExternalId = shops.find((shop) => normalizeExternalId(shop.externalId) === externalId);
    if (matchedByExternalId) {
      return matchedByExternalId;
    }
  }

  const dedupeKey = buildShopDedupeKey(target);
  if (dedupeKey) {
    const matchedByDedupeKey = shops.find((shop) => buildShopDedupeKey(shop) === dedupeKey);
    if (matchedByDedupeKey) {
      return matchedByDedupeKey;
    }
  }

  const nameKey = normalizeShopNameKey(target.name);
  if (!nameKey) {
    return null;
  }

  const matchedByName = shops.filter((shop) => normalizeShopNameKey(shop.name) === nameKey);
  if (matchedByName.length === 1) {
    return matchedByName[0];
  }

  return matchedByName[0] || null;
}
