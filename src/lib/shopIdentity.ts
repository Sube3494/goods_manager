export type ShopIdentityInput = {
  addressBookId?: unknown;
  externalId?: unknown;
  name?: unknown;
  address?: unknown;
};

export type ShopIdentityRecord = {
  id?: string;
  addressBookId?: string | null;
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

  // 如果店名原本就已经是简短的简称（例如小于等于 10 个字符），则不作切割剥离，直接完整保留
  if (normalized.length <= 10) {
    return normalized;
  }

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
  const addressBookId = target.addressBookId ? String(target.addressBookId).trim() : "";
  if (addressBookId) {
    const matchedByAddressBookId = shops.find(
      (shop) => shop.addressBookId && String(shop.addressBookId).trim() === addressBookId
    );
    if (matchedByAddressBookId) {
      return matchedByAddressBookId;
    }
  }

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

  if (matchedByName[0]) {
    return matchedByName[0];
  }

  // 智能 Fallback 匹配：如果简称已变，但“详细地址”完全一致且唯一，则判定为改名后的同一家店铺
  // 注意：只有当 target 确实没有 addressBookId 时，才允许进行地址 Fallback，防止地址库中不同别名但使用相同地址的两个独立门店被强行合并
  if (!target.addressBookId) {
    const addressKey = normalizeShopAddressKey(target.address);
    if (addressKey) {
      const matchedByAddress = shops.filter(
        (shop) => normalizeShopAddressKey(shop.address) === addressKey
      );
      if (matchedByAddress.length === 1) {
        return matchedByAddress[0];
      }
    }
  }

  return null;
}

function stripShopSuffix(value: string) {
  return value.replace(/(门店|店铺|旗舰店|总店|分店|一店|二店|三店|四店|五店|店)$/g, "").trim();
}

export function isShopNameMatch(candidate: string | null | undefined, scopedShopName: string | null | undefined) {
  const normalizedCandidate = String(candidate || "").trim();
  const normalizedScoped = String(scopedShopName || "").trim();
  if (!normalizedScoped) {
    return true;
  }
  if (!normalizedCandidate) {
    return false;
  }
  if (normalizedCandidate === normalizedScoped) {
    return true;
  }
  if (normalizedCandidate.includes(normalizedScoped) || normalizedScoped.includes(normalizedCandidate)) {
    return true;
  }

  const coreCandidate = stripShopSuffix(normalizedCandidate);
  const coreScoped = stripShopSuffix(normalizedScoped);
  if (!coreCandidate || !coreScoped) {
    return false;
  }

  return (
    coreCandidate === coreScoped ||
    coreCandidate.includes(coreScoped) ||
    coreScoped.includes(coreCandidate)
  );
}

