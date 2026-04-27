import prisma from "@/lib/prisma";
import { formatLocalDate, parseAsShanghaiTime } from "@/lib/dateUtils";
import { isAutoPickOrderTerminalStatus } from "@/lib/autoPickOrderStatus";
import { Prisma } from "../../prisma/generated-client";
import { createHash, randomBytes } from "crypto";
import { AutoPickIntegrationConfig, AutoPickMaiyatianShop, AutoPickMaiyatianShopMapping } from "@/lib/types";
import { ProductService } from "@/services/productService";

export type AutoPickInboundItem = {
  productName?: string;
  productNo?: string;
  quantity?: number;
  thumb?: string;
};

export type AutoPickInboundOrder = {
  id?: string;
  shopId?: string;
  logisticId?: string;
  city?: number;
  platform?: string;
  dailyPlatformSequence?: number;
  orderNo?: string;
  orderTime?: string;
  userAddress?: string;
  rawShopName?: string;
  shopAddress?: string;
  rawShopAddress?: string;
  isSubscribe?: boolean;
  completedAt?: string;
  longitude?: number;
  latitude?: number;
  status?: string;
  deliveryDeadline?: string;
  deliveryTimeRange?: string;
  distanceKm?: number;
  distanceIsLinear?: boolean;
  actualPaid?: number;
  expectedIncome?: number;
  platformCommission?: number;
  delivery?: {
    logisticName?: string;
    sendFee?: number;
    pickupTime?: string;
    track?: string;
    riderName?: string;
  };
  items?: AutoPickInboundItem[];
};

export type AutoPickSyncStatus =
  | "confirm"
  | "subscribe"
  | "delivery"
  | "pickup"
  | "delivering"
  | "expect"
  | "cancel"
  | "remind"
  | "meal";

export const AUTO_PICK_ALLOWED_STATUSES: AutoPickSyncStatus[] = [
  "confirm",
  "subscribe",
  "delivery",
  "pickup",
  "delivering",
  "expect",
  "cancel",
  "remind",
  "meal",
];

export type AutoPickProgressPayload = {
  platform?: string;
  orderNo?: string;
  pickRemainingSeconds?: number;
  pickCompleted?: boolean;
};

type AutoPickWebhookBinding = {
  key: string;
  userId?: string;
  email?: string;
  label?: string;
};

type AutoPickConfigPayload = {
  autoPickIntegration?: unknown;
};

function formatDeadlineSegment(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hours}:${minutes}`;
}

function looksLikeDeliveryTimeRange(value: unknown) {
  const text = String(value || "").trim();
  return /\d{1,2}:\d{2}/.test(text);
}

function resolveAutoPickDeliveryDeadline(input: Record<string, unknown>) {
  const directDeadline = String(input.deliveryDeadline || input.delivery_deadline || "").trim();
  const startTimestamp = Number(input.delivery_time || input.deliveryTime || 0);
  const endTimestamp = Number(input.delivery_end || input.deliveryEnd || 0);

  const startAt = Number.isFinite(startTimestamp) && startTimestamp > 0
    ? new Date(startTimestamp * 1000)
    : null;
  const endAt = Number.isFinite(endTimestamp) && endTimestamp > 0
    ? new Date(endTimestamp * 1000)
    : null;

  if (startAt && endAt) {
    return formatDeadlineSegment(startAt);
  }

  if (startAt) {
    return formatDeadlineSegment(startAt);
  }

  if (looksLikeDeliveryTimeRange(directDeadline)) {
    const firstTimeMatch = directDeadline.match(/^(.*?\d{1,2}:\d{2})/);
    return firstTimeMatch?.[1]?.trim() || directDeadline;
  }

  if (endAt) {
    return formatDeadlineSegment(endAt);
  }

  return undefined;
}

function resolveAutoPickDeliveryTimeRange(input: Record<string, unknown>) {
  const rangeText = String(
    input.deliveryTimeRange
    || input.delivery_time_range
    || input.delivery_time_format
    || input.deliveryTimeFormat
    || ""
  ).trim();
  return rangeText || undefined;
}

function asPrismaJsonValue<T>(value: T): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

function hashAutoPickApiKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizePluginBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function normalizeInboundApiKey(value: string) {
  return value.trim();
}

function normalizeMaiyatianCookie(value: string) {
  return value.trim();
}

function normalizeMaiyatianShopMapping(input: unknown): AutoPickMaiyatianShopMapping | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const record = input as Record<string, unknown>;
  const maiyatianShopId = String(record.maiyatianShopId || "").trim();
  const maiyatianShopName = String(record.maiyatianShopName || "").trim();
  const maiyatianShopAddress = String(record.maiyatianShopAddress || "").trim();
  const localShopName = String(record.localShopName || "").trim();
  const cityCode = String(record.cityCode || "").trim();
  const cityName = String(record.cityName || "").trim();

  if (!maiyatianShopId || !maiyatianShopName || !maiyatianShopAddress || !localShopName) {
    return null;
  }

  return {
    maiyatianShopId,
    maiyatianShopName,
    maiyatianShopAddress,
    localShopName,
    cityCode: cityCode || undefined,
    cityName: cityName || undefined,
  };
}

export function normalizeAutoPickIntegrationConfig(input: unknown): AutoPickIntegrationConfig {
  const payload = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return {
    pluginBaseUrl: normalizePluginBaseUrl(String(payload.pluginBaseUrl || "")),
    inboundApiKey: normalizeInboundApiKey(String(payload.inboundApiKey || "")),
    maiyatianCookie: normalizeMaiyatianCookie(String(payload.maiyatianCookie || "")),
    maiyatianShopMappings: Array.isArray(payload.maiyatianShopMappings)
      ? payload.maiyatianShopMappings
          .map((item) => normalizeMaiyatianShopMapping(item))
          .filter((item): item is AutoPickMaiyatianShopMapping => Boolean(item))
      : [],
  };
}

function decodeHtmlEntities(value: string) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, "\"");
}

function stripHtmlTags(value: string) {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function parseMaiyatianCityTabs(html: string) {
  const result: Array<{ cityCode: string; cityName: string }> = [];
  const cityPattern = /<a[^>]+href="\/shop\/\?city=([^"]+)"[^>]*>\s*<span>([^<]+)<\/span>\s*<\/a>/gi;
  let match: RegExpExecArray | null = null;
  while ((match = cityPattern.exec(html))) {
    const cityCode = String(match[1] || "").trim();
    const cityName = stripHtmlTags(match[2] || "");
    if (!cityCode || cityCode === "all" || !cityName) {
      continue;
    }
    result.push({ cityCode, cityName });
  }
  return result;
}

function parseMaiyatianShopRows(html: string, cityCode?: string, cityName?: string) {
  const shops: AutoPickMaiyatianShop[] = [];
  const rowPattern = /<tr>\s*<td class="multi">([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>[\s\S]*?\/shop\/edit\/\?id=(\d+)/gi;
  let match: RegExpExecArray | null = null;

  while ((match = rowPattern.exec(html))) {
    const multiCell = String(match[1] || "");
    const phone = stripHtmlTags(match[2] || "");
    const id = String(match[3] || "").trim();
    const labelMatch = multiCell.match(/<label>([\s\S]*?)<\/label>/i);
    const address = stripHtmlTags(labelMatch?.[1] || "");
    const name = stripHtmlTags(multiCell.replace(/<label>[\s\S]*?<\/label>/i, ""));

    if (!id || !name || !address) {
      continue;
    }

    shops.push({
      id,
      name,
      address,
      phone: phone || undefined,
      cityCode: cityCode || undefined,
      cityName: cityName || undefined,
    });
  }

  return shops;
}

async function fetchMaiyatianHtml(pathname: string, cookie: string) {
  const response = await fetch(`https://saas.maiyatian.com${pathname}`, {
    method: "GET",
    headers: {
      Cookie: cookie,
      "User-Agent": "Mozilla/5.0",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text.trim().slice(0, 200) || `麦芽田请求失败 ${response.status}`);
  }

  return await response.text();
}

export async function fetchMaiyatianShippingShopsByCookie(cookie: string) {
  const normalizedCookie = normalizeMaiyatianCookie(cookie);
  if (!normalizedCookie) {
    throw new Error("请先填写麦芽田 Cookie");
  }

  const entryHtml = await fetchMaiyatianHtml("/shop/", normalizedCookie);
  const cityTabs = parseMaiyatianCityTabs(entryHtml);
  const deduped = new Map<string, AutoPickMaiyatianShop>();

  for (const shop of parseMaiyatianShopRows(entryHtml)) {
    deduped.set(shop.id, shop);
  }

  for (const city of cityTabs) {
    const cityHtml = await fetchMaiyatianHtml(`/shop/?city=${encodeURIComponent(city.cityCode)}`, normalizedCookie);
    for (const shop of parseMaiyatianShopRows(cityHtml, city.cityCode, city.cityName)) {
      deduped.set(shop.id, shop);
    }
  }

  return Array.from(deduped.values()).sort((left, right) => {
    const cityCompare = String(left.cityCode || "").localeCompare(String(right.cityCode || ""));
    if (cityCompare !== 0) return cityCompare;
    return left.name.localeCompare(right.name, "zh-CN");
  });
}

export async function getAutoPickIntegrationConfigByUserId(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { permissions: true },
  });

  const permissions = user?.permissions && typeof user.permissions === "object"
    ? user.permissions as AutoPickConfigPayload
    : {};

  return normalizeAutoPickIntegrationConfig(permissions.autoPickIntegration);
}

export async function updateAutoPickIntegrationConfigByUserId(userId: string, config: AutoPickIntegrationConfig) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { permissions: true },
  });

  const currentPermissions = user?.permissions && typeof user.permissions === "object" && !Array.isArray(user.permissions)
    ? { ...(user.permissions as Record<string, unknown>) }
    : {};

  const nextPermissions: Record<string, unknown> = {
    ...currentPermissions,
    autoPickIntegration: normalizeAutoPickIntegrationConfig(config),
  };

  await prisma.user.update({
    where: { id: userId },
    data: {
      permissions: asPrismaJsonValue(nextPermissions),
    },
  });

  return normalizeAutoPickIntegrationConfig(nextPermissions.autoPickIntegration);
}

async function findUserIdByManualIntegrationKey(apiKey: string) {
  if (!apiKey) return null;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      permissions: true,
    },
  });

  for (const user of users) {
    const permissions = user.permissions && typeof user.permissions === "object"
      ? user.permissions as AutoPickConfigPayload
      : {};
    const config = normalizeAutoPickIntegrationConfig(permissions.autoPickIntegration);
    if (config.inboundApiKey && config.inboundApiKey === apiKey) {
      return user.id;
    }
  }

  return null;
}

export function generateAutoPickApiKey() {
  return `apk_${randomBytes(24).toString("hex")}`;
}

export function getAutoPickApiKeyPrefix(apiKey: string) {
  return apiKey.slice(0, 12);
}

function normalizeWebhookBinding(input: unknown): AutoPickWebhookBinding | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const record = input as Record<string, unknown>;
  const key = String(record.key || "").trim();
  const userId = String(record.userId || "").trim();
  const email = String(record.email || "").trim().toLowerCase();
  const label = String(record.label || "").trim();

  if (!key || (!userId && !email)) {
    return null;
  }

  return {
    key,
    userId: userId || undefined,
    email: email || undefined,
    label: label || undefined,
  };
}

export function getAutoPickWebhookBindings() {
  const rawJson = process.env.AUTO_PICK_WEBHOOK_KEY_MAP?.trim();
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => normalizeWebhookBinding(item))
          .filter((item): item is AutoPickWebhookBinding => Boolean(item));
      }
    } catch (error) {
      console.error("Failed to parse AUTO_PICK_WEBHOOK_KEY_MAP:", error);
    }
  }

  return [];
}

export async function getAutoPickBaseUrlForUser(userId: string) {
  const config = await getAutoPickIntegrationConfigByUserId(userId);
  if (!config.pluginBaseUrl) {
    throw new Error("Auto-pick plugin base URL is not configured");
  }
  return config.pluginBaseUrl;
}

export function getRequestApiKey(headers: Headers, searchParams?: URLSearchParams) {
  const headerKey = headers.get("x-api-key") || headers.get("x-auto-pick-key");
  if (headerKey) return headerKey.trim();

  const authorization = headers.get("authorization") || "";
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch?.[1]) {
    return bearerMatch[1].trim();
  }

  return searchParams?.get("key")?.trim() || "";
}

export async function resolveAutoPickTargetUserId(apiKey?: string) {
  if (apiKey) {
    const credential = await prisma.autoPickApiKey.findFirst({
      where: {
        keyHash: hashAutoPickApiKey(apiKey),
        revokedAt: null,
      },
      select: {
        userId: true,
      },
    });

    if (credential?.userId) {
      return credential.userId;
    }
  }

  if (apiKey) {
    const manualUserId = await findUserIdByManualIntegrationKey(apiKey);
    if (manualUserId) {
      return manualUserId;
    }
  }

  const bindings = getAutoPickWebhookBindings();

  if (apiKey) {
    const matched = bindings.find((item) => item.key === apiKey);
    if (matched?.userId) {
      const user = await prisma.user.findUnique({
        where: { id: matched.userId },
        select: { id: true },
      });
      if (user?.id) {
        return user.id;
      }
    }

    if (matched?.email) {
      const user = await prisma.user.findUnique({
        where: { email: matched.email },
        select: { id: true },
      });
      if (user?.id) {
        return user.id;
      }
    }
  }

  return null;
}

export function isAutoPickWebhookApiKeyAllowed(apiKey: string) {
  if (!apiKey) return false;
  return true;
}

export async function isAutoPickWebhookApiKeyAuthorized(apiKey: string) {
  if (!apiKey) return false;

  const existing = await prisma.autoPickApiKey.findFirst({
    where: {
      keyHash: hashAutoPickApiKey(apiKey),
      revokedAt: null,
    },
    select: { id: true },
  });

  if (existing?.id) {
    return true;
  }

  const manualUserId = await findUserIdByManualIntegrationKey(apiKey);
  if (manualUserId) {
    return true;
  }

  const bindings = getAutoPickWebhookBindings();
  return bindings.some((item) => item.key === apiKey);
}

export async function markAutoPickApiKeyUsed(apiKey: string) {
  if (!apiKey) return;

  await prisma.autoPickApiKey.updateMany({
    where: {
      keyHash: hashAutoPickApiKey(apiKey),
      revokedAt: null,
    },
    data: {
      lastUsedAt: new Date(),
    },
  });
}

export async function listAutoPickApiKeys(userId: string) {
  return await prisma.autoPickApiKey.findMany({
    where: {
      userId,
      revokedAt: null,
    },
    select: {
      id: true,
      label: true,
      keyPrefix: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function createAutoPickApiKeyForUser(userId: string, label: string) {
  const apiKey = generateAutoPickApiKey();
  const record = await prisma.autoPickApiKey.create({
    data: {
      userId,
      label: label.trim(),
      keyHash: hashAutoPickApiKey(apiKey),
      keyPrefix: getAutoPickApiKeyPrefix(apiKey),
    },
    select: {
      id: true,
      label: true,
      keyPrefix: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return {
    apiKey,
    record,
  };
}

export async function revokeAutoPickApiKey(userId: string, id: string) {
  return await prisma.autoPickApiKey.updateMany({
    where: {
      id,
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

export function normalizeAutoPickOrderPayload(payload: unknown): AutoPickInboundOrder | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const input = payload as Record<string, unknown>;
  const extend = input.extend && typeof input.extend === "object" && !Array.isArray(input.extend)
    ? input.extend as Record<string, unknown>
    : null;
  const items = Array.isArray(input.items) ? input.items : [];

  const normalized: AutoPickInboundOrder = {
    id: String(input.id || "").trim(),
    shopId: String(
      input.shop_id
      || (
        input.delivery
        && typeof input.delivery === "object"
        && !Array.isArray(input.delivery)
        && (input.delivery as Record<string, unknown>).shop_id
      )
      || ""
    ).trim() || undefined,
    logisticId: String(input.logisticId || "").trim(),
    city: Number.isFinite(Number(input.city)) ? Number(input.city) : undefined,
    platform: String(input.platform || "").trim(),
    dailyPlatformSequence: Number(input.dailyPlatformSequence || 0),
    orderNo: String(input.orderNo || "").trim(),
    orderTime: String(input.orderTime || "").trim(),
    userAddress: String(input.userAddress || "").trim(),
    rawShopName: String(
      input.rawShopName
      || extend?.channel_name
      || input.channel_name
      || input.shop_name
      || input.shopName
      || input.storeName
      || input.merchantName
      || input.merchant_name
      || ""
    ).trim() || undefined,
    shopAddress: String(
      input.shopAddress
      || input.rawShopAddress
      || input.storeAddress
      || input.merchantAddress
      || input.store_address
      || input.merchant_address
      || ""
    ).trim() || undefined,
    rawShopAddress: String(
      input.rawShopAddress
      || input.shopAddress
      || input.storeAddress
      || input.merchantAddress
      || input.store_address
      || input.merchant_address
      || ""
    ).trim() || undefined,
    isSubscribe: input.isSubscribe === true || input.isSubscribe === 1 || input.isSubscribe === "1" || input.is_subscribe === true || input.is_subscribe === 1 || input.is_subscribe === "1",
    completedAt: String(input.completedAt || input.finishedTime || input.finished_time || "").trim() || undefined,
    longitude: Number.isFinite(Number(input.longitude)) ? Number(input.longitude) : undefined,
    latitude: Number.isFinite(Number(input.latitude)) ? Number(input.latitude) : undefined,
    status: String(input.status || "").trim() || undefined,
    deliveryDeadline: resolveAutoPickDeliveryDeadline(input),
    deliveryTimeRange: resolveAutoPickDeliveryTimeRange(input),
    distanceKm: Number.isFinite(Number(input.distanceKm)) ? Number(input.distanceKm) : undefined,
    distanceIsLinear: Boolean(input.distanceIsLinear),
    actualPaid: Number.isFinite(Number(input.actualPaid)) ? Number(input.actualPaid) : 0,
    expectedIncome: Number.isFinite(Number(input.expectedIncome)) ? Number(input.expectedIncome) : undefined,
    platformCommission: Number.isFinite(Number(input.platformCommission)) ? Number(input.platformCommission) : 0,
    delivery: input.delivery && typeof input.delivery === "object" ? {
      logisticName: String((input.delivery as Record<string, unknown>).logisticName || "").trim() || undefined,
      sendFee: Number.isFinite(Number((input.delivery as Record<string, unknown>).sendFee))
        ? Number((input.delivery as Record<string, unknown>).sendFee)
        : undefined,
      pickupTime: String((input.delivery as Record<string, unknown>).pickupTime || "").trim() || undefined,
      track: String((input.delivery as Record<string, unknown>).track || "").trim() || undefined,
      riderName: String((input.delivery as Record<string, unknown>).riderName || "").trim() || undefined,
    } : undefined,
    items: items.map((item) => {
      const current = typeof item === "object" && item ? item as Record<string, unknown> : {};
      return {
        productName: String(current.productName || "").trim(),
        productNo: String(current.productNo || "").trim() || undefined,
        quantity: Math.max(0, Number(current.quantity || 0)),
        thumb: String(current.thumb || "").trim() || undefined,
      };
    }),
  };

  if (!normalized.platform || !normalized.orderNo || !normalized.orderTime || !normalized.userAddress || !normalized.id) {
    return null;
  }

  if (!normalized.items?.length) {
    return null;
  }

  return normalized;
}

export async function upsertAutoPickOrder(userId: string, payload: AutoPickInboundOrder) {
  const normalized = normalizeAutoPickOrderPayload(payload);
  if (!normalized) {
    throw new Error("Invalid auto-pick order payload");
  }

  const orderTime = parseAsShanghaiTime(normalized.orderTime);
  const items = normalized.items
    ?.filter((item) => item.productName && Number(item.quantity) > 0)
    .map((item) => ({
      productName: item.productName || "",
      productNo: item.productNo || null,
      quantity: Math.max(1, Number(item.quantity || 1)),
      thumb: item.thumb || null,
      rawPayload: item,
    })) || [];

  if (!items.length) {
    throw new Error("Order items are required");
  }

  return await prisma.$transaction(async (tx) => {
    await ensureShopProductsForAutoPickOrder(tx, userId, normalized, items);

    const existing = await tx.autoPickOrder.findUnique({
      where: {
        userId_platform_orderNo: {
          userId,
          platform: normalized.platform || "",
          orderNo: normalized.orderNo || "",
        },
      },
      select: {
        id: true,
        sourceId: true,
        logisticId: true,
        shopId: true,
        shopAddress: true,
        status: true,
        deliveryDeadline: true,
        deliveryTimeRange: true,
        delivery: true,
      },
    });

    if (existing) {
      await tx.autoPickOrderItem.deleteMany({
        where: { orderId: existing.id },
      });
    }

    const sourceId = normalized.id || existing?.sourceId || "";
    const logisticId = normalized.logisticId || existing?.logisticId || null;
    const shopId = normalized.shopId || existing?.shopId || null;
    const shopAddress = normalized.shopAddress || existing?.shopAddress || null;
    const shouldKeepTerminalStatus = isAutoPickOrderTerminalStatus(existing?.status) && !isAutoPickOrderTerminalStatus(normalized.status);
    const status = shouldKeepTerminalStatus
      ? existing?.status || null
      : normalized.status || existing?.status || null;
    const deliveryDeadline = shouldKeepTerminalStatus
      ? existing?.deliveryDeadline || normalized.deliveryDeadline || null
      : normalized.deliveryDeadline || existing?.deliveryDeadline || null;
    const deliveryTimeRange = shouldKeepTerminalStatus
      ? existing?.deliveryTimeRange || normalized.deliveryTimeRange || null
      : normalized.deliveryTimeRange || existing?.deliveryTimeRange || null;
    const nextDeliveryValue = normalized.delivery
      ? asPrismaJsonValue(normalized.delivery)
      : hasDeliveryValue(existing?.delivery)
        ? (existing?.delivery as Prisma.InputJsonValue)
        : Prisma.DbNull;

    return await tx.autoPickOrder.upsert({
      where: {
        userId_platform_orderNo: {
          userId,
          platform: normalized.platform || "",
          orderNo: normalized.orderNo || "",
        },
      },
      create: {
        userId,
        sourceId,
        logisticId,
        city: normalized.city,
        platform: normalized.platform || "",
        dailyPlatformSequence: normalized.dailyPlatformSequence || 0,
        orderNo: normalized.orderNo || "",
        orderTime,
        userAddress: normalized.userAddress || "",
        shopId,
        shopAddress,
        longitude: normalized.longitude,
        latitude: normalized.latitude,
        status,
        deliveryDeadline,
        deliveryTimeRange,
        distanceKm: normalized.distanceKm,
        distanceIsLinear: Boolean(normalized.distanceIsLinear),
        actualPaid: Math.round(Number(normalized.actualPaid || 0)),
        expectedIncome: Number.isFinite(Number(normalized.expectedIncome)) ? Math.round(Number(normalized.expectedIncome)) : null,
        platformCommission: Math.round(Number(normalized.platformCommission || 0)),
        delivery: nextDeliveryValue,
        rawPayload: asPrismaJsonValue(normalized),
        lastSyncedAt: new Date(),
        items: {
          create: items,
        },
      },
      update: {
        sourceId,
        logisticId,
        city: normalized.city,
        dailyPlatformSequence: normalized.dailyPlatformSequence || 0,
        orderTime,
        userAddress: normalized.userAddress || "",
        shopId,
        shopAddress,
        longitude: normalized.longitude,
        latitude: normalized.latitude,
        status,
        deliveryDeadline,
        deliveryTimeRange,
        distanceKm: normalized.distanceKm,
        distanceIsLinear: Boolean(normalized.distanceIsLinear),
        actualPaid: Math.round(Number(normalized.actualPaid || 0)),
        expectedIncome: Number.isFinite(Number(normalized.expectedIncome)) ? Math.round(Number(normalized.expectedIncome)) : null,
        platformCommission: Math.round(Number(normalized.platformCommission || 0)),
        delivery: nextDeliveryValue,
        rawPayload: asPrismaJsonValue(normalized),
        lastSyncedAt: new Date(),
        items: {
          create: items,
        },
      },
      include: {
        items: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
  });
}

export async function syncAutoPickOrdersFromPlugin(userId: string, options: { status?: AutoPickSyncStatus; date?: string }) {
  const baseUrl = await getAutoPickBaseUrlForUser(userId);
  const targetUrl = options.date
    ? `${baseUrl}/all-orders/${options.date}`
    : `${baseUrl}/list-orders/${options.status || "confirm"}`;

  const response = await fetch(targetUrl, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(errorText || `Auto-pick sync failed with status ${response.status}`);
  }

  const orders = await response.json() as unknown;
  if (!Array.isArray(orders)) {
    throw new Error("Auto-pick plugin returned invalid order data");
  }

  const normalized = orders
    .map((order) => normalizeAutoPickOrderPayload(order))
    .filter((order): order is AutoPickInboundOrder => Boolean(order));

  const results = [];
  for (const order of normalized) {
    results.push(await upsertAutoPickOrder(userId, order));
  }

  return {
    count: results.length,
    orders: results,
  };
}

function normalizeAutoPickProgressPayload(payload: unknown): AutoPickProgressPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const input = payload as Record<string, unknown>;
  const platform = String(input.platform || "").trim();
  const orderNo = String(input.orderNo || "").trim();
  const pickRemainingSeconds = Number(input.pickRemainingSeconds);
  const pickCompleted = Boolean(input.pickCompleted);

  if (!platform || !orderNo) {
    return null;
  }

  return {
    platform,
    orderNo,
    pickRemainingSeconds: Number.isFinite(pickRemainingSeconds) ? Math.max(0, pickRemainingSeconds) : undefined,
    pickCompleted,
  };
}

export function parseAutoPickProgressPayload(payload: unknown) {
  return normalizeAutoPickProgressPayload(payload);
}

function buildProgressStatus(progress: AutoPickProgressPayload, currentStatus?: string | null) {
  if (progress.pickCompleted) {
    return "已拣货";
  }

  if (typeof progress.pickRemainingSeconds === "number") {
    const remainingMinutes = Math.ceil(progress.pickRemainingSeconds / 60);
    if (remainingMinutes <= 0) {
      return "拣货中";
    }
    return `拣货中（约${remainingMinutes}分钟）`;
  }

  return currentStatus || "拣货中";
}

function hasDeliveryValue(value: unknown) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length > 0);
}

function toNormalizedText(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .replace(/[（(].*?[)）]/g, " ")
    .replace(/\s+/g, "")
    .toLowerCase();
}

async function ensurePushCategory(tx: Prisma.TransactionClient, userId: string) {
  const existing = await tx.category.findFirst({
    where: {
      userId,
      name: "推送添加",
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (existing) {
    return existing;
  }

  return await tx.category.create({
    data: {
      userId,
      name: "推送添加",
    },
    select: {
      id: true,
      name: true,
    },
  });
}

async function ensureShopProductsForAutoPickOrder(
  tx: Prisma.TransactionClient,
  userId: string,
  normalized: AutoPickInboundOrder,
  items: Array<{
    productName: string;
    productNo: string | null;
    quantity: number;
    thumb: string | null;
    rawPayload: AutoPickInboundItem;
  }>
) {
  const externalShopId = String(normalized.shopId || "").trim();
  if (!externalShopId || items.length === 0) {
    return;
  }

  const shop = await tx.shop.findFirst({
    where: {
      userId,
      externalId: externalShopId,
    },
    select: {
      id: true,
    },
  });

  if (!shop?.id) {
    return;
  }

  const existingShopProducts = await tx.shopProduct.findMany({
    where: {
      shopId: shop.id,
    },
    select: {
      productName: true,
    },
  });

  const existingNames = new Set(
    existingShopProducts
      .map((item) => toNormalizedText(item.productName))
      .filter(Boolean)
  );

  const missingItems = items.filter((item) => {
    const normalizedName = toNormalizedText(item.productName);
    return normalizedName && !existingNames.has(normalizedName);
  });

  if (missingItems.length === 0) {
    return;
  }

  const category = await ensurePushCategory(tx, userId);

  for (const item of missingItems) {
    const normalizedName = toNormalizedText(item.productName);
    if (!normalizedName || existingNames.has(normalizedName)) {
      continue;
    }

    await tx.shopProduct.create({
      data: {
        shopId: shop.id,
        sourceProductId: null,
        sku: item.productNo || null,
        productName: item.productName,
        pinyin: ProductService.generatePinyinSearchText(item.productName),
        productImage: item.thumb || null,
        categoryId: category.id,
        categoryName: category.name,
        costPrice: 0,
        stock: 0,
        isPublic: false,
        isDiscontinued: false,
        remark: "自动推单补建",
        specs: Prisma.JsonNull,
      },
    });

    existingNames.add(normalizedName);
  }
}

export async function applyAutoPickProgress(userId: string, payload: unknown) {
  const progress = normalizeAutoPickProgressPayload(payload);
  if (!progress) {
    throw new Error("Invalid progress payload");
  }

  const order = await prisma.autoPickOrder.findFirst({
    where: {
      userId,
      platform: progress.platform,
      orderNo: progress.orderNo,
    },
    orderBy: {
      orderTime: "desc",
    },
  });

  if (!order) {
    throw new Error("Order not found");
  }

  if (isAutoPickOrderTerminalStatus(order.status)) {
    return await prisma.autoPickOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: {
        items: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  const nextRawPayload = order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)
    ? {
        ...(order.rawPayload as Record<string, unknown>),
        pickProgress: {
          pickRemainingSeconds: progress.pickRemainingSeconds ?? null,
          pickCompleted: Boolean(progress.pickCompleted),
          updatedAt: new Date().toISOString(),
        },
      }
    : {
        pickProgress: {
          pickRemainingSeconds: progress.pickRemainingSeconds ?? null,
          pickCompleted: Boolean(progress.pickCompleted),
          updatedAt: new Date().toISOString(),
        },
      };

  return await prisma.autoPickOrder.update({
    where: { id: order.id },
    data: {
      status: buildProgressStatus(progress, order.status),
      rawPayload: asPrismaJsonValue(nextRawPayload),
      lastSyncedAt: new Date(),
    },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function refreshAutoPickOrderFromPlugin(
  userId: string,
  lookup: { id?: string; platform?: string; orderNo?: string; orderTime?: Date | string | null }
) {
  const baseUrl = await getAutoPickBaseUrlForUser(userId);

  const sourceId = String(lookup.id || "").trim();
  if (sourceId) {
    const detailResponse = await fetch(`${baseUrl}/order-detail/${encodeURIComponent(sourceId)}`, {
      method: "GET",
      cache: "no-store",
    });

    if (detailResponse.ok) {
      const detailOrder = await detailResponse.json().catch(() => null) as unknown;
      const normalizedDetailOrder = normalizeAutoPickOrderPayload(detailOrder);
      if (normalizedDetailOrder) {
        return await upsertAutoPickOrder(userId, normalizedDetailOrder);
      }
      throw new Error("Auto-pick plugin returned invalid order detail data");
    }
  }

  const targetDate = lookup.orderTime ? formatLocalDate(lookup.orderTime) : formatLocalDate(new Date());
  const response = await fetch(`${baseUrl}/all-orders/${targetDate}`, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(errorText || `Auto-pick refresh failed with status ${response.status}`);
  }

  const orders = await response.json().catch(() => null) as unknown;
  if (!Array.isArray(orders)) {
    throw new Error("Auto-pick plugin returned invalid refresh data");
  }

  const matched = orders
    .map((order) => normalizeAutoPickOrderPayload(order))
    .filter((order): order is AutoPickInboundOrder => Boolean(order))
    .find((order) => {
      if (lookup.id && order.id === lookup.id) return true;
      return order.platform === lookup.platform && order.orderNo === lookup.orderNo;
    });

  if (!matched) {
    return null;
  }

  return await upsertAutoPickOrder(userId, matched);
}

export async function backfillPersistedAutoPickOrderFields(userId: string) {
  const orders = await prisma.autoPickOrder.findMany({
    where: {
      userId,
      OR: [
        { shopId: null },
        { shopAddress: null },
        { deliveryTimeRange: null },
        { expectedIncome: null },
      ],
    },
    select: {
      id: true,
      rawPayload: true,
      shopId: true,
      shopAddress: true,
      deliveryTimeRange: true,
      expectedIncome: true,
    },
  });

  let updatedCount = 0;

  for (const order of orders) {
    const normalized = normalizeAutoPickOrderPayload(order.rawPayload);
    if (!normalized) {
      continue;
    }

    const nextData: Prisma.AutoPickOrderUpdateInput = {};

    if (!order.shopId && normalized.shopId) {
      nextData.shopId = normalized.shopId;
    }

    if (!order.shopAddress && normalized.shopAddress) {
      nextData.shopAddress = normalized.shopAddress;
    }

    if (!order.deliveryTimeRange && normalized.deliveryTimeRange) {
      nextData.deliveryTimeRange = normalized.deliveryTimeRange;
    }

    if (order.expectedIncome == null && Number.isFinite(Number(normalized.expectedIncome))) {
      nextData.expectedIncome = Math.round(Number(normalized.expectedIncome));
    }

    if (Object.keys(nextData).length === 0) {
      continue;
    }

    await prisma.autoPickOrder.update({
      where: { id: order.id },
      data: nextData,
    });
    updatedCount += 1;
  }

  return { count: updatedCount };
}

export async function callAutoPickCommand(userId: string, pathname: "/self-delivery" | "/complete-delivery" | "/pickup-complete", payload: Record<string, unknown>) {
  const baseUrl = await getAutoPickBaseUrlForUser(userId);
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}
