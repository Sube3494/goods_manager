import prisma from "@/lib/prisma";
import { parseAsShanghaiTime } from "@/lib/dateUtils";
import { Prisma } from "../../prisma/generated-client";
import { createHash, randomBytes } from "crypto";
import { AutoPickIntegrationConfig } from "@/lib/types";

export type AutoPickInboundItem = {
  productName?: string;
  productNo?: string;
  quantity?: number;
  thumb?: string;
};

export type AutoPickInboundOrder = {
  id?: string;
  logisticId?: string;
  city?: number;
  platform?: string;
  dailyPlatformSequence?: number;
  orderNo?: string;
  orderTime?: string;
  userAddress?: string;
  longitude?: number;
  latitude?: number;
  status?: string;
  deliveryDeadline?: string;
  distanceKm?: number;
  distanceIsLinear?: boolean;
  actualPaid?: number;
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

type AutoPickWebhookBinding = {
  key: string;
  userId?: string;
  email?: string;
  label?: string;
};

type AutoPickConfigPayload = {
  autoPickIntegration?: unknown;
};

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

export function normalizeAutoPickIntegrationConfig(input: unknown): AutoPickIntegrationConfig {
  const payload = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return {
    pluginBaseUrl: normalizePluginBaseUrl(String(payload.pluginBaseUrl || "")),
    inboundApiKey: normalizeInboundApiKey(String(payload.inboundApiKey || "")),
  };
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
  const items = Array.isArray(input.items) ? input.items : [];

  const normalized: AutoPickInboundOrder = {
    id: String(input.id || "").trim(),
    logisticId: String(input.logisticId || "").trim(),
    city: Number.isFinite(Number(input.city)) ? Number(input.city) : undefined,
    platform: String(input.platform || "").trim(),
    dailyPlatformSequence: Number(input.dailyPlatformSequence || 0),
    orderNo: String(input.orderNo || "").trim(),
    orderTime: String(input.orderTime || "").trim(),
    userAddress: String(input.userAddress || "").trim(),
    longitude: Number.isFinite(Number(input.longitude)) ? Number(input.longitude) : undefined,
    latitude: Number.isFinite(Number(input.latitude)) ? Number(input.latitude) : undefined,
    status: String(input.status || "").trim() || undefined,
    deliveryDeadline: String(input.deliveryDeadline || "").trim() || undefined,
    distanceKm: Number.isFinite(Number(input.distanceKm)) ? Number(input.distanceKm) : undefined,
    distanceIsLinear: Boolean(input.distanceIsLinear),
    actualPaid: Number.isFinite(Number(input.actualPaid)) ? Number(input.actualPaid) : 0,
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

  const deliveryValue = normalized.delivery ? asPrismaJsonValue(normalized.delivery) : Prisma.DbNull;

  return await prisma.$transaction(async (tx) => {
    const existing = await tx.autoPickOrder.findUnique({
      where: {
        userId_platform_orderNo: {
          userId,
          platform: normalized.platform || "",
          orderNo: normalized.orderNo || "",
        },
      },
      select: { id: true },
    });

    if (existing) {
      await tx.autoPickOrderItem.deleteMany({
        where: { orderId: existing.id },
      });
    }

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
        sourceId: normalized.id || "",
        logisticId: normalized.logisticId || null,
        city: normalized.city,
        platform: normalized.platform || "",
        dailyPlatformSequence: normalized.dailyPlatformSequence || 0,
        orderNo: normalized.orderNo || "",
        orderTime,
        userAddress: normalized.userAddress || "",
        longitude: normalized.longitude,
        latitude: normalized.latitude,
        status: normalized.status || null,
        deliveryDeadline: normalized.deliveryDeadline || null,
        distanceKm: normalized.distanceKm,
        distanceIsLinear: Boolean(normalized.distanceIsLinear),
        actualPaid: Math.round(Number(normalized.actualPaid || 0)),
        platformCommission: Math.round(Number(normalized.platformCommission || 0)),
        delivery: deliveryValue,
        rawPayload: asPrismaJsonValue(normalized),
        lastSyncedAt: new Date(),
        items: {
          create: items,
        },
      },
      update: {
        sourceId: normalized.id || "",
        logisticId: normalized.logisticId || null,
        city: normalized.city,
        dailyPlatformSequence: normalized.dailyPlatformSequence || 0,
        orderTime,
        userAddress: normalized.userAddress || "",
        longitude: normalized.longitude,
        latitude: normalized.latitude,
        status: normalized.status || null,
        deliveryDeadline: normalized.deliveryDeadline || null,
        distanceKm: normalized.distanceKm,
        distanceIsLinear: Boolean(normalized.distanceIsLinear),
        actualPaid: Math.round(Number(normalized.actualPaid || 0)),
        platformCommission: Math.round(Number(normalized.platformCommission || 0)),
        delivery: deliveryValue,
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

export async function callAutoPickCommand(userId: string, pathname: "/self-delivery" | "/complete-delivery", payload: Record<string, unknown>) {
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
