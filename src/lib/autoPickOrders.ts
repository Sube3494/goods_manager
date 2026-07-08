import prisma from "@/lib/prisma";
import { formatLocalDate, parseAsShanghaiTime } from "@/lib/dateUtils";
import { getBaseAutoPickStatusDisplay, isAutoPickOrderAbnormalStatus, isAutoPickOrderCancelledStatus, isAutoPickOrderCompletedStatus, isAutoPickOrderDeletedStatus, isAutoPickOrderDeliveringStatus, isAutoPickOrderTerminalStatus, isAutoPickOtherPickupOrder, isAutoPickPickupOrder, resolveAutoPickBusinessStatus } from "@/lib/autoPickOrderStatus";
import { Prisma } from "../../prisma/generated-client";
import { createHash, randomBytes } from "crypto";
import { AutoPickIntegrationConfig, AutoPickMaiyatianShop, AutoPickMaiyatianShopMapping, AutoPickSelfDeliveryTimingConfig } from "@/lib/types";
import { InventoryService } from "@/services/inventoryService";
import { emitAutoPickOrderEvent } from "@/lib/autoPickOrderEvents";
import { FinanceMath } from "@/lib/math";
import { buildShopDedupeKey, findMatchingShopRecord, normalizeExternalId, normalizeShopAddress, normalizeShopAddressKey, normalizeShopNameKey, isShopNameMatch } from "@/lib/shopIdentity";
import { getOutboundOrderItemSchemaErrorMessage } from "@/lib/prismaSchemaCompat";
import { getStorageStrategy } from "@/lib/storage";

export type AutoPickInboundItem = {
  productName?: string;
  productNo?: string;
  quantity?: number;
  thumb?: string;
};

export type AutoPickInboundOrder = {
  id?: string;
  shopId?: string;
  deliveryId?: string;
  city?: number;
  channelTag?: string;
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
    riderPhone?: string;
    completedTime?: string;
  };
  items?: AutoPickInboundItem[];
  unencryptedPhone?: string;
  unencryptedMapAddress?: string;
  unencryptedAddress?: string;
  customerName?: string;
  customerPhone?: string;
  customerMaskedPhone?: string;
  customerPhoneExtension?: string;
  customerRemark?: string;
  [key: string]: unknown;
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
  statusHint?: string;
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

type AutoPickSystemMeta = {
  resolvedShop?: {
    id?: string;
    name?: string;
  };
  mainSystemSelfDelivery?: {
    triggered: boolean;
    triggeredAt?: string;
    userId?: string;
  };
  autoOutbound?: {
    status?: "success" | "failed";
    attemptedAt?: string;
    resolvedAt?: string;
    error?: string;
    outboundOrderId?: string;
  };
};

type AutoPickManualMatchedProductMeta = {
  id?: string;
  name?: string;
  sku?: string | null;
  image?: string | null;
  sourceType?: "product" | "shopProduct";
  shopProductId?: string | null;
  shopName?: string | null;
  bundleItems?: any[];
};

const MAIYATIAN_BASE_URL = "https://saas.maiyatian.com";
const MAIYATIAN_ORDER_LIST_PATH = "/order/list/?&";
const MAIYATIAN_QUERY_LIST_PATH = "/query/list/?&";
const MAIYATIAN_REAL_USER_INFO_PATH = "/order/getRealUserInfo/?f=json&id=";
const MAIYATIAN_ORDER_DETAIL_PATH = "/order/detail/?detail=1&f=json&id=";

const MAIYATIAN_MEAL_COMPLETE_PATH = "/order/mealComplete/?f=json";
const AUTO_PICK_CONFIRM_LISTEN_INTERVAL_MS = 1500;
const AUTO_PICK_STATE_LISTEN_INTERVAL_MS = 5000;

type MaiyatianRawOrder = {
  id?: string;
  channel_id?: string | number;
  shop_id?: string | number;
  merchant_id?: string | number;
  city?: string | number;
  source_id?: string;
  source_sn?: string;
  delivery_id?: string | number;
  order_time?: string | number;
  channel_name?: string;
  map_address?: string;
  address?: string;
  shop_name?: string;
  longitude?: string | number;
  latitude?: string | number;
  tips?: string;
  delivery_time?: string | number;
  delivery_end?: string | number;
  delivery_time_format?: string;
  delivery_distance?: string | number;
  total_price?: string | number;
  balance_price?: string | number;
  user_fee?: string | number;
  shop_fee?: string | number;
  commission?: string | number;
  channel_tag_name?: string;
  extend?: Record<string, unknown>;
  is_subscribe?: boolean | number | string;
  finished_time?: string | number;
  finishedTime?: string;
  delivery?: Record<string, unknown> | false;
  fee?: {
    user_fee?: string | number;
    shop_fee?: string | number;
    commission?: string | number;
    total_fee?: string | number;
  };
  [key: string]: unknown;
};

type MaiyatianRawListResponse = {
  errno?: number;
  message?: string;
  data?: MaiyatianRawOrder[];
};

type AutoPickCookieListenerState = {
  started: boolean;
  running: boolean;
  timer?: NodeJS.Timeout;
  stateSignatures: Map<string, string>;
  lastStateSyncAt: number;
};

type MaiyatianQueryOrder = Record<string, unknown>;

type MaiyatianQueryListResponse = {
  errno?: number;
  message?: string;
  data?: MaiyatianQueryOrder[];
};

type MaiyatianRealUserInfoResponse = {
  errno?: number;
  message?: string;
  data?: {
    phone?: string;
    phone_extend?: string;
    backup_phone?: string;
    secret_phone?: string;
    address?: string;
    map_address?: string;
    real_name?: string;
    nick_name?: string;
  };
};

type MaiyatianOrderDetailResponse = {
  errno?: number;
  message?: string;
  data?: {
    source_id?: string;
    id?: string;
    channel_id?: string | number;
    shop_id?: string | number;
    merchant_id?: string | number;
    source_sn?: string;
    channel_tag_name?: string;
    channel_name?: string;
    extend?: {
      channel_name?: string;
    };
    order_time?: string;
    map_address?: string;
    address?: string;
    shop_name?: string;
    longitude?: string | number;
    latitude?: string | number;
    tips?: string;
    delivery_distance?: string | number;
    total_price?: string | number;
    balance_price?: string | number;
    delivery_time?: string | number;
    delivery_end?: string | number;
    delivery_time_format?: string;
    finished_time?: string | number;
    finishedTime?: string;
    goods?: Array<{
      goods_name?: string;
      sku_code?: string;
      number?: string | number;
      thumb?: string;
      pickup_time?: string | number;
      pickupTime?: string | number;
      picker_time?: string | number;
      pickerTime?: string | number;
    }>;
    delivery?: {
      id?: string | number;
      logistic_id?: string | number;
      logistic_name?: string;
      send_fee?: string | number;
      tip?: string | number;
      premium_fee?: string | number;
      pickup_time?: string | number;
      track?: string;
      delivery_name?: string;
      finished_time?: string | number;
      shop_id?: string | number;
    } | false;
    fee?: {
      user_fee?: string | number;
      shop_fee?: string | number;
    };
    [key: string]: unknown;
  };
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

function extractDeliveryRangeLeadingSegment(text: string) {
  const normalized = String(text || "").trim();
  if (!normalized) return "";

  const leadingRangeMatch = normalized.match(/^(.*?\d{1,2}:\d{2})\s*[-~至]/);
  if (leadingRangeMatch?.[1]) {
    return leadingRangeMatch[1].trim();
  }

  const firstTimeMatch = normalized.match(/^(.*?\d{1,2}:\d{2})/);
  return firstTimeMatch?.[1]?.trim() || normalized;
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
    return formatDeadlineSegment(endAt);
  }

  if (endAt) {
    return formatDeadlineSegment(endAt);
  }

  if (looksLikeDeliveryTimeRange(directDeadline)) {
    return extractDeliveryRangeLeadingSegment(directDeadline);
  }

  if (startAt) {
    return formatDeadlineSegment(startAt);
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

function getAutoPickCookieListenerState() {
  const scoped = globalThis as typeof globalThis & {
    autoPickCookieListenerState?: AutoPickCookieListenerState;
  };

  if (!scoped.autoPickCookieListenerState) {
    scoped.autoPickCookieListenerState = {
      started: false,
      running: false,
      stateSignatures: new Map<string, string>(),
      lastStateSyncAt: 0,
    };
  }

  return scoped.autoPickCookieListenerState;
}

function readAutoPickSystemMeta(rawPayload: unknown): AutoPickSystemMeta | null {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const record = rawPayload as Record<string, unknown>;
  const candidate = record.systemMeta;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  return candidate as AutoPickSystemMeta;
}

function readResolvedAutoPickShop(rawPayload: unknown) {
  const systemMeta = readAutoPickSystemMeta(rawPayload);
  const resolvedShop = systemMeta?.resolvedShop;
  if (!resolvedShop || typeof resolvedShop !== "object") {
    return null;
  }

  const id = String(resolvedShop.id || "").trim();
  const name = String(resolvedShop.name || "").trim();
  if (!id && !name) {
    return null;
  }

  return {
    id: id || null,
    name: name || null,
  };
}

export function readCustomerRemarkFromRawPayload(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const readRemarkFromRecord = (record: Record<string, unknown>) => {
    const value = String(
      record.customerRemark
      || record.user_remark
      || record.userRemark
      || record.buyer_remark
      || record.buyerRemark
      || record.remark
      || record.memo
      || record.note
      || ""
    ).trim();
    return value || null;
  };

  const root = rawPayload as Record<string, unknown>;
  const directValue = readRemarkFromRecord(root);
  if (directValue) {
    return directValue;
  }

  const nestedCandidates = [
    root.data,
    root.extend,
    root.order,
    root.orderInfo,
    root.order_info,
    root.extra,
    root.payload,
  ];

  for (const candidate of nestedCandidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }
    const nestedValue = readRemarkFromRecord(candidate as Record<string, unknown>);
    if (nestedValue) {
      return nestedValue;
    }
  }

  return null;
}

function readTrimmedCandidateValue(candidates: unknown[]) {
  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (value) return value;
  }
  return null;
}

function splitPrivacyPhoneValue(value: unknown) {
  const text = String(value || "").trim();
  if (!text) {
    return { phone: null, extension: null };
  }

  const normalized = text.replace(/\s+/g, "");
  const match = normalized.match(/^(.+?)[_#-](\d{2,})$/);
  if (!match) {
    return { phone: normalized, extension: null };
  }

  return {
    phone: String(match[1] || "").trim() || null,
    extension: String(match[2] || "").trim() || null,
  };
}

export function readCustomerNameFromRawPayload(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const root = rawPayload as Record<string, unknown>;
  const userInfo = root.userInfo && typeof root.userInfo === "object" && !Array.isArray(root.userInfo)
    ? root.userInfo as Record<string, unknown>
    : null;
  const nestedCandidates = [root.data, root.extend, root.order, root.orderInfo, root.order_info, root.extra, root.payload];

  const directValue = readTrimmedCandidateValue([
    root.customerName,
    root.real_name,
    root.realName,
    root.nick_name,
    root.nickName,
    root.buyer_name,
    root.buyerName,
    userInfo?.real_name,
    userInfo?.realName,
    userInfo?.nick_name,
    userInfo?.nickName,
  ]);
  if (directValue) {
    return directValue;
  }

  for (const candidate of nestedCandidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }
    const nested = candidate as Record<string, unknown>;
    const nestedValue = readTrimmedCandidateValue([
      nested.customerName,
      nested.real_name,
      nested.realName,
      nested.nick_name,
      nested.nickName,
      nested.buyer_name,
      nested.buyerName,
    ]);
    if (nestedValue) {
      return nestedValue;
    }
  }

  return null;
}

export function readCustomerPhoneFromRawPayload(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const root = rawPayload as Record<string, unknown>;
  const userInfo = root.userInfo && typeof root.userInfo === "object" && !Array.isArray(root.userInfo)
    ? root.userInfo as Record<string, unknown>
    : null;
  const nestedCandidates = [root.data, root.extend, root.order, root.orderInfo, root.order_info, root.extra, root.payload];

  const directValue = readTrimmedCandidateValue([
    splitPrivacyPhoneValue(root.customerPhone).phone,
    root.unencryptedPhone,
    root.unencrypted_phone,
    splitPrivacyPhoneValue(root.phone).phone,
    root.secret_phone,
    userInfo?.unencrypted_phone,
    userInfo?.unencryptedPhone,
    splitPrivacyPhoneValue(userInfo?.customerPhone).phone,
    splitPrivacyPhoneValue(userInfo?.phone).phone,
    userInfo?.secret_phone,
  ]);
  if (directValue) {
    return directValue;
  }

  for (const candidate of nestedCandidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }
    const nested = candidate as Record<string, unknown>;
    const nestedValue = readTrimmedCandidateValue([
      splitPrivacyPhoneValue(nested.customerPhone).phone,
      nested.unencryptedPhone,
      nested.unencrypted_phone,
      splitPrivacyPhoneValue(nested.phone).phone,
      nested.secret_phone,
    ]);
    if (nestedValue) {
      return nestedValue;
    }
  }

  return null;
}

export function readCustomerMaskedPhoneFromRawPayload(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const root = rawPayload as Record<string, unknown>;
  const userInfo = root.userInfo && typeof root.userInfo === "object" && !Array.isArray(root.userInfo)
    ? root.userInfo as Record<string, unknown>
    : null;
  const nestedCandidates = [root.data, root.extend, root.order, root.orderInfo, root.order_info, root.extra, root.payload];

  const directValue = readTrimmedCandidateValue([
    root.customerMaskedPhone,
    root.secret_phone,
    userInfo?.secret_phone,
  ]);
  if (directValue) {
    return directValue;
  }

  for (const candidate of nestedCandidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }
    const nested = candidate as Record<string, unknown>;
    const nestedValue = readTrimmedCandidateValue([
      nested.customerMaskedPhone,
      nested.secret_phone,
    ]);
    if (nestedValue) {
      return nestedValue;
    }
  }

  return null;
}

export function readCustomerPhoneExtensionFromRawPayload(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const root = rawPayload as Record<string, unknown>;
  const userInfo = root.userInfo && typeof root.userInfo === "object" && !Array.isArray(root.userInfo)
    ? root.userInfo as Record<string, unknown>
    : null;
  const nestedCandidates = [root.data, root.extend, root.order, root.orderInfo, root.order_info, root.extra, root.payload];

  const directValue = readTrimmedCandidateValue([
    root.customerPhoneExtension,
    root.phone_extend,
    splitPrivacyPhoneValue(root.customerPhone).extension,
    splitPrivacyPhoneValue(root.phone).extension,
    userInfo?.phone_extend,
    splitPrivacyPhoneValue(userInfo?.customerPhone).extension,
    splitPrivacyPhoneValue(userInfo?.phone).extension,
  ]);
  if (directValue) {
    return directValue;
  }

  for (const candidate of nestedCandidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }
    const nested = candidate as Record<string, unknown>;
    const nestedValue = readTrimmedCandidateValue([
      nested.customerPhoneExtension,
      nested.phone_extend,
      splitPrivacyPhoneValue(nested.customerPhone).extension,
      splitPrivacyPhoneValue(nested.phone).extension,
    ]);
    if (nestedValue) {
      return nestedValue;
    }
  }

  return null;
}

export function readRiderPhoneFromDelivery(delivery: unknown): string | null {
  if (!delivery || typeof delivery !== "object" || Array.isArray(delivery)) {
    return null;
  }

  const record = delivery as Record<string, unknown>;
  return readTrimmedCandidateValue([
    record.riderPhone,
    record.delivery_phone,
    record.deliveryPhone,
    record.phone,
    record.mobile,
    record.tel,
    record.telephone,
  ]);
}

export function readRiderPhoneFromRawPayload(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const root = rawPayload as Record<string, unknown>;
  const rootValue = readRiderPhoneFromDelivery(root.delivery);
  if (rootValue) {
    return rootValue;
  }

  const nestedCandidates = [root.data, root.extend, root.order, root.orderInfo, root.order_info, root.extra, root.payload];
  for (const candidate of nestedCandidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }
    const nested = candidate as Record<string, unknown>;
    const nestedValue = readRiderPhoneFromDelivery(nested.delivery) || readTrimmedCandidateValue([
      nested.riderPhone,
      nested.delivery_phone,
      nested.deliveryPhone,
      nested.phone,
      nested.mobile,
    ]);
    if (nestedValue) {
      return nestedValue;
    }
  }

  return null;
}

function mergeAutoPickSystemMeta(
  basePayload: Record<string, unknown>,
  existingRawPayload: unknown,
  explicitSystemMeta?: AutoPickSystemMeta | null
) {
  const existingRecord = readAutoPickRawPayloadRecord(existingRawPayload);
  const existingSystemMeta = readAutoPickSystemMeta(existingRawPayload);
  const nextSystemMeta = explicitSystemMeta || existingSystemMeta;
  const nextPayload = { ...basePayload };

  if (!("pickProgress" in nextPayload) && "pickProgress" in existingRecord) {
    nextPayload.pickProgress = existingRecord.pickProgress;
  }

  // 继承旧的备注字段，防止一键同步（列表数据无备注）覆盖了旧有的备注数据
  const remarkKeys = ["customerRemark", "user_remark", "userRemark", "buyer_remark", "buyerRemark", "remark", "memo", "note"];
  for (const key of remarkKeys) {
    if ((!(key in nextPayload) || !nextPayload[key]) && (key in existingRecord) && existingRecord[key]) {
      nextPayload[key] = existingRecord[key];
    }
  }

  if (!nextSystemMeta) {
    return nextPayload;
  }

  return {
    ...nextPayload,
    systemMeta: nextSystemMeta,
  };
}

function getAutoPickOrderRecencyTimestamp(candidate: {
  lastSyncedAt?: Date | string | null;
  createdAt?: Date | string | null;
}) {
  const lastSyncedAt = candidate.lastSyncedAt ? new Date(candidate.lastSyncedAt).getTime() : Number.NaN;
  if (Number.isFinite(lastSyncedAt)) {
    return lastSyncedAt;
  }

  const createdAt = candidate.createdAt ? new Date(candidate.createdAt).getTime() : Number.NaN;
  if (Number.isFinite(createdAt)) {
    return createdAt;
  }

  return 0;
}

function hashAutoPickApiKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizePluginBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function normalizeComparableApiKey(value: string) {
  let normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  normalized = normalized.replace(/^['"`]+|['"`]+$/g, "").trim();

  const envStyleMatch = normalized.match(/^(?:export\s+)?(?:MYSHOP_API_KEY|X_API_KEY|AUTO_PICK_API_KEY)\s*=\s*(.+)$/i);
  if (envStyleMatch?.[1]) {
    normalized = envStyleMatch[1].trim();
  }

  const bearerMatch = normalized.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch?.[1]) {
    normalized = bearerMatch[1].trim();
  }

  return normalized.replace(/^['"`]+|['"`]+$/g, "").trim();
}

function normalizeInboundApiKey(value: string) {
  return normalizeComparableApiKey(value);
}

function normalizeMaiyatianCookie(value: string) {
  return value.trim();
}



function findMappedShopNameFromAutoPickConfig(
  maiyatianShopId: string | null,
  rawShopName: string | null,
  rawShopAddress: string | null,
  permissions: unknown
) {
  const record = permissions && typeof permissions === "object" && !Array.isArray(permissions)
    ? permissions as AutoPickConfigPayload
    : {};
  const config = normalizeAutoPickIntegrationConfig(record.autoPickIntegration);

  if (config.maiyatianShopMappings.length === 0) {
    return null;
  }

  const normalizedShopId = normalizeExternalId(maiyatianShopId);
  if (normalizedShopId) {
    const matchedById = config.maiyatianShopMappings.find((item) => String(item.maiyatianShopId || "").trim() === normalizedShopId);
    if (matchedById?.localShopName) {
      return matchedById.localShopName;
    }
  }

  const matchedByIdentity = config.maiyatianShopMappings.find((item) => {
    if (buildShopDedupeKey({
      name: item.maiyatianShopName,
      address: item.maiyatianShopAddress,
    }) && buildShopDedupeKey({
      name: item.maiyatianShopName,
      address: item.maiyatianShopAddress,
    }) === buildShopDedupeKey({
      name: rawShopName,
      address: rawShopAddress,
    })) {
      return true;
    }

    return normalizeShopNameKey(item.maiyatianShopName) === normalizeShopNameKey(rawShopName);
  });
  return matchedByIdentity?.localShopName || null;
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

function normalizeTimingMinutes(value: unknown, fallback: number, options?: { min?: number; max?: number }) {
  const min = options?.min ?? 0;
  const max = options?.max ?? 999;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Number(numeric.toFixed(2))));
}

export function getDefaultAutoPickSelfDeliveryTimingConfig(): AutoPickSelfDeliveryTimingConfig {
  return {
    pickupMinutes: 8,
    minutesPerKm: 3,
    riderUpstairsMinutes: 5,
    deadlineLeadMinutes: 5,
  };
}

export function normalizeAutoPickSelfDeliveryTimingConfig(input: unknown): AutoPickSelfDeliveryTimingConfig {
  const payload = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const defaults = getDefaultAutoPickSelfDeliveryTimingConfig();

  return {
    pickupMinutes: normalizeTimingMinutes(payload.pickupMinutes, defaults.pickupMinutes, { min: 0, max: 180 }),
    minutesPerKm: normalizeTimingMinutes(payload.minutesPerKm, defaults.minutesPerKm, { min: 0, max: 60 }),
    riderUpstairsMinutes: normalizeTimingMinutes(payload.riderUpstairsMinutes, defaults.riderUpstairsMinutes, { min: 0, max: 180 }),
    deadlineLeadMinutes: normalizeTimingMinutes(payload.deadlineLeadMinutes, defaults.deadlineLeadMinutes, { min: 0, max: 120 }),
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
    selfDeliveryTiming: normalizeAutoPickSelfDeliveryTimingConfig(payload.selfDeliveryTiming),
    defaultBrushCommission: typeof payload.defaultBrushCommission === "number"
      ? payload.defaultBrushCommission
      : typeof payload.defaultBrushCommission === "string"
        ? parseFloat(payload.defaultBrushCommission) || 0
        : 0,
  };
}

function parseExpectedAutoCompleteBase(deadlineText: string | null | undefined, orderTime: Date | string) {
  const text = String(deadlineText || "").replace(/\s+/g, " ").trim();
  if (!text) return null;

  const timeMatch = text.match(/(?:今日|今天|明日|明天|后日|后天)?\s*(\d{1,2}:\d{2})/);
  if (!timeMatch) return null;

  const baseDate = parseAsShanghaiTime(orderTime);
  const candidate = new Date(baseDate);
  candidate.setSeconds(0, 0);

  const [hours, minutes] = timeMatch[1].split(":").map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  candidate.setHours(hours, minutes, 0, 0);

  if (/明日|明天/.test(text)) {
    candidate.setDate(candidate.getDate() + 1);
  } else if (/后日|后天/.test(text)) {
    candidate.setDate(candidate.getDate() + 2);
  } else if ((/今日|今天/.test(text) || !/明日|明天|后日|后天/.test(text)) && candidate.getTime() < baseDate.getTime() - 60 * 1000) {
    candidate.setDate(candidate.getDate() + 1);
  }

  if (candidate.getTime() <= Date.now()) {
    return null;
  }

  return candidate;
}

function estimateAutoCompleteAtForOrder(
  order: {
    orderTime?: string | Date;
    distanceKm?: number | null;
    deliveryDeadline?: string | null;
  },
  config?: Partial<AutoPickSelfDeliveryTimingConfig> | null,
) {
  const orderTime = order.orderTime;
  if (!orderTime) {
    return null;
  }

  const timing = config ? normalizeAutoPickSelfDeliveryTimingConfig(config) : getDefaultAutoPickSelfDeliveryTimingConfig();
  const distanceKm = typeof order.distanceKm === "number" ? order.distanceKm : null;
  const heuristicAt = distanceKm != null
    ? new Date(Date.now() + (timing.pickupMinutes + distanceKm * timing.minutesPerKm + timing.riderUpstairsMinutes) * 60 * 1000)
    : null;

  const expectedAt = parseExpectedAutoCompleteBase(order.deliveryDeadline, orderTime);
  const latestSafeAt = expectedAt
    ? new Date(expectedAt.getTime() - timing.deadlineLeadMinutes * 60 * 1000)
    : null;

  if (heuristicAt && latestSafeAt) {
    return heuristicAt.getTime() <= latestSafeAt.getTime() ? heuristicAt : latestSafeAt;
  }

  if (heuristicAt) {
    return heuristicAt;
  }

  if (latestSafeAt) {
    return latestSafeAt;
  }

  return null;
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

function normalizePlatformName(platform: string) {
  const normalized = String(platform || "").trim();
  if (!normalized) {
    return "";
  }
  if (normalized === "淘宝闪购") return "淘宝";
  return normalized;
}

function inferPlatformNameFromChannelTag(channelTag: unknown) {
  const normalizedTag = String(channelTag || "").trim().toLowerCase();
  if (!normalizedTag) {
    return "";
  }

  if (normalizedTag === "shangou") {
    return "美团";
  }

  if (normalizedTag === "daojia") {
    return "京东";
  }

  return "";
}

function readPreferredMaiyatianPlatform(rawOrder: Record<string, unknown>, fallback = "") {
  const extend = rawOrder.extend && typeof rawOrder.extend === "object" && !Array.isArray(rawOrder.extend)
    ? rawOrder.extend as Record<string, unknown>
    : null;
  const inferredByChannelTag = inferPlatformNameFromChannelTag(
    rawOrder.channel_tag ?? extend?.channel_tag
  );

  const candidates = [
    rawOrder.channel_tag_name,
    rawOrder.platform,
    rawOrder.platform_name,
    extend?.channel_tag_name,
    inferredByChannelTag,
  ];

  for (const item of candidates) {
    const value = String(item || "").trim();
    if (value) {
      return normalizePlatformName(value);
    }
  }

  return normalizePlatformName(fallback);
}

function parseUnixTimestampToOrderTime(rawValue: string | number | undefined) {
  const seconds = Number(rawValue || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const date = new Date(seconds * 1000);
  try {
    const formatter = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    return formatter.format(date).replace(" ", " ");
  } catch {
    const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    const year = shifted.getUTCFullYear();
    const month = `${shifted.getUTCMonth() + 1}`.padStart(2, "0");
    const day = `${shifted.getUTCDate()}`.padStart(2, "0");
    const hours = `${shifted.getUTCHours()}`.padStart(2, "0");
    const minutes = `${shifted.getUTCMinutes()}`.padStart(2, "0");
    const secondsPart = `${shifted.getUTCSeconds()}`.padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}:${secondsPart}`;
  }
}

function parseDeliveryDeadline(value: string | undefined) {
  const text = String(value || "").trim();
  if (!text) return "";
  return stripHtmlTags(text);
}

function parseMaiyatianStatusValue(rawValue: unknown) {
  const normalized = String(rawValue || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "delete" || normalized === "deleted") {
    return "已删除";
  }
  if (
    normalized === "cancel"
    || normalized === "cancelled"
    || normalized === "canceled"
    || normalized === "close"
    || normalized === "closed"
  ) {
    return "已取消";
  }
  return String(rawValue || "").trim();
}

function resolveMaiyatianOrderStatus(rawOrder: Record<string, unknown>) {
  const tipStatus = parseDeliveryDeadline(String(rawOrder.tips || "").trim());
  if (tipStatus) {
    return tipStatus;
  }

  return parseMaiyatianStatusValue(rawOrder.status);
}

function parseDeliveryTimeRange(value: string | undefined) {
  return parseDeliveryDeadline(value);
}

function parseDeliveryDeadlineFromTimestamp(rawValue: string | number | undefined) {
  const fullText = parseUnixTimestampToOrderTime(rawValue);
  if (!fullText) return "";
  return fullText.slice(5, 16);
}

function parseCentsValue(rawValue: string | number | undefined) {
  const value = Number(rawValue || 0);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function pickFirstValidTimeValue(...candidates: unknown[]) {
  for (const candidate of candidates) {
    if (typeof candidate === "number") {
      if (Number.isFinite(candidate) && candidate > 0) {
        return candidate;
      }
      continue;
    }
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (!trimmed || trimmed === "0") {
        continue;
      }
      return trimmed;
    }
  }
  return undefined;
}

function parseCoordinate(rawValue: string | number | undefined) {
  const value = Number(rawValue || 0);
  return Number.isFinite(value) ? value : 0;
}

function applyJDPlatformCommissionFallback(platform: string, actualPaid: number, platformCommission: number) {
  const normalizedPlatform = String(platform || "").trim();
  if (normalizedPlatform !== "京东" || platformCommission !== 0 || !Number.isFinite(actualPaid) || actualPaid <= 0) {
    return platformCommission;
  }
  return -Math.round((actualPaid - 100) * 0.06 + 100);
}

function parseAmountsFromRawValues(platform: string, rawValues: {
  commission?: string | number;
  userFee?: string | number;
  shopFee?: string | number;
  totalPrice?: string | number;
  balancePrice?: string | number;
}) {
  const actualPaid = parseCentsValue(rawValues.userFee ?? rawValues.totalPrice);
  const expectedIncome = parseCentsValue(rawValues.shopFee ?? rawValues.balancePrice);
  const explicitCommission = Number(rawValues.commission);
  const computedCommission = expectedIncome - actualPaid;
  const platformCommission = applyJDPlatformCommissionFallback(
    platform,
    actualPaid,
    Number.isFinite(explicitCommission) ? Math.round(explicitCommission) : computedCommission,
  );

  return {
    actualPaid,
    expectedIncome,
    platformCommission,
  };
}



function readPreferredMaiyatianShopName(rawOrder: Record<string, unknown>) {
  const extend = rawOrder.extend && typeof rawOrder.extend === "object" && !Array.isArray(rawOrder.extend)
    ? rawOrder.extend as Record<string, unknown>
    : null;

  const candidates = [
    rawOrder.shop_name,
    extend?.channel_name,
    rawOrder.channel_name,
    rawOrder.shopName,
    rawOrder.storeName,
    rawOrder.merchantName,
    rawOrder.merchant_name,
  ];

  for (const item of candidates) {
    const value = String(item || "").trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function readPreferredMaiyatianShopAddress(rawOrder: Record<string, unknown>) {
  const extend = rawOrder.extend && typeof rawOrder.extend === "object" && !Array.isArray(rawOrder.extend)
    ? rawOrder.extend as Record<string, unknown>
    : null;
  const candidates = [
    rawOrder.shop_address,
    rawOrder.shopAddress,
    rawOrder.storeAddress,
    rawOrder.merchantAddress,
    rawOrder.channelAddress,
    rawOrder.store_address,
    rawOrder.merchant_address,
    rawOrder.channel_address,
    extend?.storeAddress,
    extend?.store_address,
    extend?.merchantAddress,
    extend?.merchant_address,
    extend?.channelAddress,
    extend?.channel_address,
    rawOrder.shop_name,
  ];

  for (const item of candidates) {
    const value = String(item || "").trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function readMaiyatianIsSubscribe(rawOrder: Record<string, unknown>) {
  const rawValue = rawOrder.is_subscribe ?? rawOrder.isSubscribe;
  return rawValue === true || rawValue === 1 || rawValue === "1";
}

function readMaiyatianCompletedAt(rawOrder: Record<string, unknown>) {
  const delivery = rawOrder.delivery && typeof rawOrder.delivery === "object" && !Array.isArray(rawOrder.delivery)
    ? rawOrder.delivery as Record<string, unknown>
    : null;

  const timestamp = Number(
    delivery?.finished_time
    ?? rawOrder.finished_time
    ?? rawOrder.finishedTime
    ?? 0,
  );

  if (Number.isFinite(timestamp) && timestamp > 0) {
    return parseUnixTimestampToOrderTime(timestamp);
  }

  const directText = String(rawOrder.finished_time || rawOrder.finishedTime || "").trim();
  return directText || undefined;
}

function buildListenedOrderFromRawOrder(rawOrder: MaiyatianRawOrder): AutoPickInboundOrder | null {
  const orderNo = String(rawOrder.source_id || "").trim();
  if (!orderNo) return null;
  const channelTag = String((rawOrder as Record<string, unknown>).channel_tag || "").trim();
  const platform = readPreferredMaiyatianPlatform(rawOrder as Record<string, unknown>);
  const { actualPaid, expectedIncome, platformCommission } = parseAmountsFromRawValues(platform, {
    commission: rawOrder.fee?.commission ?? rawOrder.commission,
    userFee: rawOrder.fee?.user_fee ?? rawOrder.user_fee,
    shopFee: rawOrder.fee?.shop_fee ?? rawOrder.shop_fee,
    totalPrice: rawOrder.fee?.total_fee ?? rawOrder.total_price,
    balancePrice: rawOrder.balance_price,
  });

  return {
    id: String(rawOrder.id || "").trim(),
    shopId: String(rawOrder.shop_id || "").trim() || undefined,
    deliveryId: normalizeAutoPickDeliveryId(rawOrder.delivery_id),
    city: Math.max(0, Number(rawOrder.city || 0) || 0),
    channelTag: channelTag || undefined,
    platform,
    dailyPlatformSequence: Number(rawOrder.source_sn || 0) || 0,
    orderNo,
    orderTime: parseUnixTimestampToOrderTime(rawOrder.order_time),
    userAddress: String(rawOrder.map_address || rawOrder.address || "").trim(),
    rawShopName: readPreferredMaiyatianShopName(rawOrder as Record<string, unknown>),
    shopAddress: readPreferredMaiyatianShopAddress(rawOrder as Record<string, unknown>),
    rawShopAddress: readPreferredMaiyatianShopAddress(rawOrder as Record<string, unknown>),
    isSubscribe: readMaiyatianIsSubscribe(rawOrder as Record<string, unknown>),
    completedAt: readMaiyatianCompletedAt(rawOrder as Record<string, unknown>),
    longitude: parseCoordinate(rawOrder.longitude),
    latitude: parseCoordinate(rawOrder.latitude),
    status: resolveMaiyatianOrderStatus(rawOrder as Record<string, unknown>),
    deliveryDeadline: parseDeliveryDeadlineFromTimestamp(rawOrder.delivery_time),
    deliveryTimeRange: parseDeliveryTimeRange(rawOrder.delivery_time_format),
    distanceKm: Math.max(0, Number(rawOrder.delivery_distance || 0) / 1000),
    distanceIsLinear: false,
    actualPaid,
    expectedIncome,
    platformCommission,
    items: [],
  };
}

function buildListenedOrderFromQueryOrder(rawOrder: MaiyatianQueryOrder): AutoPickInboundOrder | null {
  const orderNo = String(rawOrder.source_id || "").trim();
  if (!orderNo) return null;
  const channelTag = String(rawOrder.channel_tag || "").trim();
  const platform = readPreferredMaiyatianPlatform(rawOrder);
  const fee = rawOrder.fee && typeof rawOrder.fee === "object" && !Array.isArray(rawOrder.fee)
    ? rawOrder.fee as Record<string, unknown>
    : null;
  const { actualPaid, expectedIncome, platformCommission } = parseAmountsFromRawValues(platform, {
    commission: (fee?.commission ?? rawOrder.commission) as string | number | undefined,
    userFee: (fee?.user_fee ?? rawOrder.user_fee) as string | number | undefined,
    shopFee: (fee?.shop_fee ?? rawOrder.shop_fee) as string | number | undefined,
    totalPrice: (fee?.total_fee ?? rawOrder.total_price) as string | number | undefined,
    balancePrice: rawOrder.balance_price as string | number | undefined,
  });

  return {
    id: String(rawOrder.id || "").trim(),
    shopId: String(rawOrder.shop_id || "").trim() || undefined,
    deliveryId: normalizeAutoPickDeliveryId(rawOrder.delivery_id),
    city: Math.max(0, Number(rawOrder.city || 0) || 0),
    channelTag: channelTag || undefined,
    platform,
    dailyPlatformSequence: Number(rawOrder.source_sn || 0) || 0,
    orderNo,
    orderTime: typeof rawOrder.order_time === "string"
      ? String(rawOrder.order_time).trim()
      : parseUnixTimestampToOrderTime(rawOrder.order_time as string | number | undefined),
    userAddress: String(rawOrder.map_address || rawOrder.address || "").trim(),
    rawShopName: readPreferredMaiyatianShopName(rawOrder),
    shopAddress: readPreferredMaiyatianShopAddress(rawOrder),
    rawShopAddress: readPreferredMaiyatianShopAddress(rawOrder),
    isSubscribe: readMaiyatianIsSubscribe(rawOrder),
    completedAt: readMaiyatianCompletedAt(rawOrder),
    longitude: parseCoordinate(rawOrder.longitude as string | number | undefined),
    latitude: parseCoordinate(rawOrder.latitude as string | number | undefined),
    status: resolveMaiyatianOrderStatus(rawOrder),
    deliveryDeadline: parseDeliveryDeadlineFromTimestamp(rawOrder.delivery_time as string | number | undefined),
    deliveryTimeRange: parseDeliveryTimeRange(rawOrder.delivery_time_format as string | undefined),
    distanceKm: Math.max(0, Number(rawOrder.delivery_distance || 0) / 1000),
    distanceIsLinear: false,
    actualPaid,
    expectedIncome,
    platformCommission,
    items: [],
  };
}

function parseDeliveryInfoFromDetail(detail: MaiyatianOrderDetailResponse["data"]) {
  const delivery = detail && detail.delivery && typeof detail.delivery === "object" ? detail.delivery : null;
  const deliveryRecord = delivery as Record<string, unknown> | null;
  const detailRecord = detail as Record<string, unknown> | undefined;
  const goods = detail && Array.isArray(detail.goods) ? detail.goods : [];
  const isJdLike = String(
    detailRecord?.channel_tag
    || detailRecord?.source_tag
    || detailRecord?.goods_channel_tag
    || ""
  ).trim().toLowerCase() === "daojia";
  const firstGoodsWithTime = goods.find((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    const record = item as Record<string, unknown>;
    return Boolean(
      record.pickup_time
      || record.pickupTime
      || record.picker_time
      || record.pickerTime
    );
  }) as Record<string, unknown> | undefined;

  const logisticName = String(deliveryRecord?.logistic_name || deliveryRecord?.logisticName || "").trim();
  const rawSendFee = deliveryRecord?.send_fee ?? deliveryRecord?.sendFee;
  const sendFee = typeof rawSendFee === "string" || typeof rawSendFee === "number"
    ? parseCentsValue(rawSendFee)
    : 0;
  const jdLikePickupCandidates = [
    detail?.pickup_time,
    detail?.pickupTime,
    detail?.picker_time,
    detail?.pickerTime,
    firstGoodsWithTime?.pickup_time,
    firstGoodsWithTime?.pickupTime,
    firstGoodsWithTime?.picker_time,
    firstGoodsWithTime?.pickerTime,
    deliveryRecord?.pickup_time,
    deliveryRecord?.pickupTime,
    deliveryRecord?.pick_time,
    deliveryRecord?.pickTime,
    detail?.delivery_time,
  ];
  const normalPickupCandidates = [
    deliveryRecord?.pickup_time,
    deliveryRecord?.pickupTime,
    deliveryRecord?.pick_time,
    deliveryRecord?.pickTime,
    detail?.pickup_time,
    detail?.pickupTime,
    detail?.picker_time,
    detail?.pickerTime,
    firstGoodsWithTime?.pickup_time,
    firstGoodsWithTime?.pickupTime,
    firstGoodsWithTime?.picker_time,
    firstGoodsWithTime?.pickerTime,
    detail?.delivery_time,
  ];
  const rawPickupTime = pickFirstValidTimeValue(...(isJdLike ? jdLikePickupCandidates : normalPickupCandidates));
  const pickupTime = typeof rawPickupTime === "string" && rawPickupTime.includes("-")
    ? String(rawPickupTime).trim()
    : (typeof rawPickupTime === "string" || typeof rawPickupTime === "number"
        ? parseUnixTimestampToOrderTime(rawPickupTime)
        : undefined);
  const track = String(deliveryRecord?.track || "").trim();
  const riderName = String(deliveryRecord?.delivery_name || deliveryRecord?.riderName || "").trim() || undefined;
  const riderPhone = readRiderPhoneFromDelivery(deliveryRecord);

  const rawFinishedTime = deliveryRecord?.finished_time
    ?? deliveryRecord?.finishedTime
    ?? detail?.finished_time
    ?? detail?.finishedTime;
  const completedTime = typeof rawFinishedTime === "string" && rawFinishedTime.includes("-")
    ? String(rawFinishedTime).trim()
    : (typeof rawFinishedTime === "string" || typeof rawFinishedTime === "number"
        ? parseUnixTimestampToOrderTime(rawFinishedTime)
        : undefined);

  if (!logisticName && sendFee <= 0 && !pickupTime && !track && !riderName && !riderPhone && !completedTime) {
    return undefined;
  }

  return {
    logisticName,
    sendFee,
    pickupTime,
    track,
    riderName,
    riderPhone: riderPhone || undefined,
    completedTime,
  };
}

function parseAmountsFromDetail(detail: MaiyatianOrderDetailResponse["data"], platform = "") {
  const fee = detail?.fee;
  if (!fee) {
    return undefined;
  }

  const actualPaid = parseCentsValue(fee.user_fee);
  const expectedIncome = parseCentsValue(fee.shop_fee);
  const platformCommission = applyJDPlatformCommissionFallback(platform, actualPaid, expectedIncome - actualPaid);
  return {
    actualPaid,
    expectedIncome,
    platformCommission,
  };
}

function buildItemsFromDetailJSON(detail: MaiyatianOrderDetailResponse["data"]): AutoPickInboundItem[] {
  const goods = detail && Array.isArray(detail.goods) ? detail.goods : [];
  return goods.map((item) => ({
    productName: String(item.goods_name || "").trim(),
    productNo: String(item.sku_code || "").trim() || undefined,
    quantity: Math.max(1, Number(item.number || 0) || 1),
    thumb: String(item.thumb || "").trim() || undefined,
  })).filter((item) => item.productName || item.productNo);
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
  const response = await fetch(`${MAIYATIAN_BASE_URL}${pathname}`, {
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

async function fetchMaiyatianText(pathname: string, cookie: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cookie", cookie);
  headers.set("User-Agent", headers.get("User-Agent") || "Mozilla/5.0");
  headers.set("Accept", headers.get("Accept") || "application/json, text/javascript, */*; q=0.01");

  const response = await fetch(`${MAIYATIAN_BASE_URL}${pathname}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(text.trim().slice(0, 200) || `麦芽田请求失败 ${response.status}`);
  }

  return text;
}

async function fetchMaiyatianJson<T>(pathname: string, cookie: string, init?: RequestInit): Promise<T> {
  const text = await fetchMaiyatianText(pathname, cookie, init);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`麦芽田返回了非 JSON 内容: ${text.trim().slice(0, 200)}`);
  }
}

function assertMaiyatianSuccess(response: { errno?: number; message?: string }, fallback: string) {
  if (response.errno === 1 || response.errno === 0) {
    return;
  }
  throw new Error(String(response.message || fallback).trim() || fallback);
}

function buildMaiyatianRawListPath(status: AutoPickSyncStatus) {
  const query = new URLSearchParams({
    page: "1",
    status,
    is_sort: "0",
    page_size: "20",
    sort: "1",
    shop_id: "undefined",
    delivery_type: "0",
    dispatch_status: "0",
    meal_status: "0",
    f: "json",
  });
  return `${MAIYATIAN_ORDER_LIST_PATH}${query.toString()}`;
}

function buildMaiyatianQueryListPath(date: string, page: number) {
  const query = new URLSearchParams({
    page: String(page),
    page_size: "20",
    filter_type: "all",
    filter_goods_num: "goods_number",
    filter_gird: "all",
    filter_label: "all",
    filter_time: "0",
    filter_stime: "60",
    filter_date: date,
    date_type: "order_date",
    shop_id: "0",
    mode: "list",
    sort_map: "[object Object]",
    controller: "open",
    sort: "1",
    goods_number: "0",
    f: "json",
  });
  return `${MAIYATIAN_QUERY_LIST_PATH}${query.toString()}`;
}

async function fetchMaiyatianRawOrderListByCookie(cookie: string, status: AutoPickSyncStatus) {
  const response = await fetchMaiyatianJson<MaiyatianRawListResponse>(buildMaiyatianRawListPath(status), cookie);
  assertMaiyatianSuccess(response, "读取麦芽田订单列表失败");
  return Array.isArray(response.data) ? response.data : [];
}

async function fetchMaiyatianOrderDetailByCookie(cookie: string, orderId: string) {
  const response = await fetchMaiyatianJson<MaiyatianOrderDetailResponse>(
    `${MAIYATIAN_ORDER_DETAIL_PATH}${encodeURIComponent(orderId)}`,
    cookie,
  );
  assertMaiyatianSuccess(response, "读取麦芽田订单详情失败");
  return response.data;
}

async function fetchMaiyatianRealUserInfoByCookie(cookie: string, orderId: string) {
  const response = await fetchMaiyatianJson<MaiyatianRealUserInfoResponse>(
    `${MAIYATIAN_REAL_USER_INFO_PATH}${encodeURIComponent(orderId)}`,
    cookie,
  );
  assertMaiyatianSuccess(response, "读取麦芽田收货信息失败");
  return response.data;
}

async function enrichMaiyatianOrderByCookie(cookie: string, order: AutoPickInboundOrder) {
  const rawOrderId = String(order.id || "").trim();
  if (!rawOrderId) {
    return order;
  }

  const [userInfo, detailData] = await Promise.all([
    fetchMaiyatianRealUserInfoByCookie(cookie, rawOrderId).catch(() => null),
    fetchMaiyatianOrderDetailByCookie(cookie, rawOrderId).catch(() => null),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userInfoObj = userInfo as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detailDataObj = detailData as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderObj = order as any;

  const unencryptedPhone = String(
    userInfoObj?.unencrypted_phone
    || userInfoObj?.unencryptedPhone
    || detailDataObj?.unencrypted_phone
    || detailDataObj?.unencryptedPhone
    || ""
  ).trim();
  const splitUserPhone = splitPrivacyPhoneValue(userInfoObj?.phone);
  const splitDetailPhone = splitPrivacyPhoneValue(detailDataObj?.phone);
  const maskedPhone = String(
    userInfoObj?.secret_phone
    || userInfoObj?.secretPhone
    || detailDataObj?.secret_phone
    || detailDataObj?.secretPhone
    || splitUserPhone.phone
    || splitDetailPhone.phone
    || ""
  ).trim();
  const phoneExtension = String(
    userInfoObj?.phone_extend
    || detailDataObj?.phone_extend
    || splitUserPhone.extension
    || splitDetailPhone.extension
    || ""
  ).trim();
  const unencryptedMapAddress = userInfoObj && String(userInfoObj.unencrypted_map_address || "").trim();
  const unencryptedAddress = userInfoObj && String(userInfoObj.unencrypted_address || "").trim();
  const realName = String(
    userInfoObj?.real_name
    || userInfoObj?.realName
    || detailDataObj?.real_name
    || detailDataObj?.realName
    || ""
  ).trim();
  const nickName = String(
    userInfoObj?.nick_name
    || userInfoObj?.nickName
    || detailDataObj?.nick_name
    || detailDataObj?.nickName
    || ""
  ).trim();

  if (unencryptedPhone) {
    orderObj.unencryptedPhone = unencryptedPhone;
    orderObj.customerPhone = unencryptedPhone;
  } else if (maskedPhone) {
    orderObj.customerPhone = maskedPhone;
  }
  if (maskedPhone) {
    orderObj.customerMaskedPhone = maskedPhone;
  }
  if (phoneExtension) {
    orderObj.customerPhoneExtension = phoneExtension;
  }
  if (realName || nickName) {
    orderObj.customerName = realName || nickName;
  }

  const fullAddress = unencryptedMapAddress
    || unencryptedAddress
    || String(userInfoObj?.map_address || userInfoObj?.address || "").trim()
    || String(detailDataObj?.map_address || detailDataObj?.address || "").trim();

  if (fullAddress) {
    order.userAddress = fullAddress;
  }

  if (!detailData) {
    return order;
  }

  const detailId = String(detailData.id || "").trim();
  const detailDeliveryId = normalizeAutoPickDeliveryId(
    detailData.delivery && typeof detailData.delivery === "object"
      ? detailData.delivery.id || detailData.delivery.logistic_id || ""
      : ""
  );
  if (detailId) {
    order.id = detailId;
  }
  if (detailDeliveryId) {
    order.deliveryId = detailDeliveryId;
  }

  const isJD = order.platform === "京东" || order.channelTag === "daojia" || String(detailData.channel_tag || "").trim().toLowerCase() === "daojia";
  const detailShopId = String(isJD ? (detailData.shop_id || "") : (detailData.shop_id || detailData.merchant_id || "")).trim();
  if (detailShopId) {
    order.shopId = detailShopId;
  }

  const detailShopName = readPreferredMaiyatianShopName((detailData || {}) as Record<string, unknown>);
  if (detailShopName) {
    order.rawShopName = detailShopName;
  }

  const detailShopAddress = readPreferredMaiyatianShopAddress((detailData || {}) as Record<string, unknown>);
  if (detailShopAddress) {
    order.shopAddress = detailShopAddress;
    order.rawShopAddress = detailShopAddress;
  }

  const deliveryInfo = parseDeliveryInfoFromDetail(detailData);
  if (deliveryInfo) {
    order.delivery = deliveryInfo;
  }

  const customerRemark = detailData ? String(
    detailData.customerRemark
    || detailData.user_remark
    || detailData.userRemark
    || detailData.buyer_remark
    || detailData.buyerRemark
    || detailData.remark
    || detailData.memo
    || detailData.note
    || ""
  ).trim() : "";
  if (customerRemark) {
    order.customerRemark = customerRemark;
  }

  const amountInfo = parseAmountsFromDetail(detailData, order.platform);
  if (amountInfo) {
    order.actualPaid = amountInfo.actualPaid;
    order.expectedIncome = amountInfo.expectedIncome;
    order.platformCommission = amountInfo.platformCommission;
  }

  const detailItems = buildItemsFromDetailJSON(detailData);
  if (detailItems.length > 0) {
    order.items = detailItems;
  }

  const detailRemark = detailDataObj?.user_remark || detailDataObj?.remark || detailDataObj?.buyer_remark || detailDataObj?.memo;
  if (detailRemark) {
    order.customerRemark = String(detailRemark).trim();
  }

  const detailOrderTime = String(detailData.order_time || "").trim();
  if (detailOrderTime) {
    order.orderTime = detailOrderTime;
  }

  const detailLongitude = parseCoordinate(detailData.longitude);
  const detailLatitude = parseCoordinate(detailData.latitude);
  if (detailLongitude !== 0) {
    order.longitude = detailLongitude;
  }
  if (detailLatitude !== 0) {
    order.latitude = detailLatitude;
  }

  const detailDistanceKm = Math.max(0, Number(detailData.delivery_distance || 0) / 1000);
  if (detailDistanceKm > 0) {
    order.distanceKm = detailDistanceKm;
  }

  if (!order.deliveryDeadline) {
    order.deliveryDeadline = parseDeliveryDeadlineFromTimestamp(detailData.delivery_time);
  }
  if (!order.deliveryTimeRange) {
    order.deliveryTimeRange = parseDeliveryTimeRange(detailData.delivery_time_format);
  }
  const detailStatus = resolveMaiyatianOrderStatus((detailData || {}) as Record<string, unknown>);
  if (detailStatus) {
    const shouldKeepListStatus = !isAutoPickOrderAbnormalStatus(order.status)
      && isAutoPickOrderAbnormalStatus(detailStatus);
    if (!shouldKeepListStatus) {
      order.status = detailStatus;
    }
  }
  if (!order.completedAt) {
    order.completedAt = readMaiyatianCompletedAt((detailData || {}) as Record<string, unknown>);
  }

  return order;
}

async function fetchSimplifiedMaiyatianOrderListByCookie(cookie: string, status: AutoPickSyncStatus) {
  const rows = await fetchMaiyatianRawOrderListByCookie(cookie, status);
  const results: AutoPickInboundOrder[] = [];

  for (const row of rows) {
    const order = buildListenedOrderFromRawOrder(row);
    if (!order) continue;
    await enrichMaiyatianOrderByCookie(cookie, order);
    results.push(order);
  }

  return results;
}

async function findAutoPickOrderFromRawActiveStatusLists(
  cookie: string,
  lookup: { id?: string; platform?: string; orderNo?: string; orderTime?: Date | string | null }
) {
  const fallbackPlatform = String(lookup.platform || "").trim();
  const fallbackOrderNo = String(lookup.orderNo || "").trim();
  const canTrustLookupPlatform = Boolean(fallbackPlatform && fallbackPlatform !== "未知");
  const activeStatuses: AutoPickSyncStatus[] = [
    "confirm",
    "subscribe",
    "delivery",
    "pickup",
    "delivering",
    "expect",
    "remind",
    "meal",
  ];

  for (const status of activeStatuses) {
    const rows = await fetchMaiyatianRawOrderListByCookie(cookie, status).catch(() => []);
    const matched = rows
      .map((row) => buildListenedOrderFromRawOrder(row))
      .filter((order): order is AutoPickInboundOrder => Boolean(order))
      .find((order) => {
        if (lookup.id && order.id === lookup.id) return true;
        if (order.orderNo !== fallbackOrderNo) {
          return false;
        }
        if (!canTrustLookupPlatform) {
          return true;
        }
        return order.platform === fallbackPlatform;
      });

    if (matched) {
      return matched;
    }
  }

  return null;
}

async function fetchSimplifiedAllMaiyatianOrdersByDateByCookie(cookie: string, date: string) {
  const results: AutoPickInboundOrder[] = [];

  for (let page = 1; page < 100; page += 1) {
    const response = await fetchMaiyatianJson<MaiyatianQueryListResponse>(
      buildMaiyatianQueryListPath(date, page),
      cookie,
    );
    assertMaiyatianSuccess(response, "读取麦芽田历史订单失败");
    const rows = Array.isArray(response.data) ? response.data : [];
    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      const order = buildListenedOrderFromQueryOrder(row);
      if (!order) continue;
      await enrichMaiyatianOrderByCookie(cookie, order);
      results.push(order);
    }

    if (rows.length < 20) {
      break;
    }
  }

  return results;
}

async function fetchSimplifiedMaiyatianOrderDetailByCookie(cookie: string, orderId: string) {
  const detailData = await fetchMaiyatianOrderDetailByCookie(cookie, orderId);
  if (!detailData) {
    return null;
  }

  const detailRecord = detailData as Record<string, unknown>;
  const order = buildListenedOrderFromQueryOrder(detailRecord) || buildListenedOrderFromRawOrder(detailRecord as MaiyatianRawOrder);
  if (!order) {
    return null;
  }

  await enrichMaiyatianOrderByCookie(cookie, order);
  return order;
}

async function getMaiyatianCookieForUser(userId: string) {
  const config = await getAutoPickIntegrationConfigByUserId(userId);
  if (!config.maiyatianCookie) {
    throw new Error("Maiyatian cookie is not configured");
  }
  return config.maiyatianCookie;
}

async function submitMaiyatianFormByCookie(
  cookie: string,
  pathname: string,
  params: Record<string, string>,
  successReason: string,
) {
  const body = new URLSearchParams(params).toString();
  const parsed = await fetchMaiyatianJson<{ errno?: number; message?: string; [key: string]: unknown }>(pathname, cookie, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "x-requested-with": "XMLHttpRequest",
    },
    body,
  }).catch(async (error) => {
    return {
      errno: -1,
      message: error instanceof Error ? error.message : String(error),
    };
  });

  return {
    ok: parsed.errno === 1,
    reason: parsed.errno === 1 ? successReason : String(parsed.message || "").trim() || undefined,
    parsed,
    submitParams: params,
  };
}



export async function submitMaiyatianMealCompleteByCookie(cookie: string, sourceId: string, orderNo = "") {
  if (!sourceId) {
    return {
      ok: false,
      reason: "missing-meal-complete-id",
      orderNo,
    };
  }

  return await submitMaiyatianFormByCookie(cookie, MAIYATIAN_MEAL_COMPLETE_PATH, {
    id: sourceId,
  }, "meal-complete-submitted");
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

export async function testMaiyatianCookieConnection(cookie: string) {
  const normalizedCookie = normalizeMaiyatianCookie(cookie);
  if (!normalizedCookie) {
    throw new Error("请先填写麦芽田 Cookie");
  }

  const html = await fetchMaiyatianHtml("/shop/", normalizedCookie);
  const shops = parseMaiyatianShopRows(html);
  return {
    ok: true,
    shopCount: shops.length,
  };
}

export async function getAutoPickIntegrationConfigByUserId(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { permissions: true },
  });

  const currentPermissions = user?.permissions && typeof user.permissions === "object" && !Array.isArray(user.permissions)
    ? { ...(user.permissions as Record<string, unknown>) }
    : {};
  return normalizeAutoPickIntegrationConfig(currentPermissions.autoPickIntegration);
}

async function listAutoPickCookieUsers() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      permissions: true,
    },
  });

  return users
    .map((user) => {
      const permissions = user.permissions && typeof user.permissions === "object"
        ? user.permissions as AutoPickConfigPayload
        : {};
      const config = normalizeAutoPickIntegrationConfig(permissions.autoPickIntegration);
      return {
        id: user.id,
        cookie: String(config.maiyatianCookie || "").trim(),
      };
    })
    .filter((item) => item.cookie);
}

export async function updateAutoPickIntegrationConfigByUserId(userId: string, config: AutoPickIntegrationConfig) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { permissions: true },
  });

  const currentPermissions = user?.permissions && typeof user.permissions === "object" && !Array.isArray(user.permissions)
    ? { ...(user.permissions as Record<string, unknown>) }
    : {};

  const normalizedInput = normalizeAutoPickIntegrationConfig(config);
  if (normalizedInput.inboundApiKey) {
    const taken = await isManualIntegrationKeyTaken(normalizedInput.inboundApiKey, userId);
    if (taken) {
      throw new Error("回调密钥已被其他账号占用，请更换后再保存");
    }
  }

  const nextConfig: AutoPickIntegrationConfig = {
    ...normalizedInput,
  };

  const nextPermissions: Record<string, unknown> = {
    ...currentPermissions,
    autoPickIntegration: nextConfig,
  };

  await prisma.user.update({
    where: { id: userId },
    data: {
      permissions: asPrismaJsonValue(nextPermissions),
    },
  });

  await syncAutoPickPluginCookie(nextConfig);

  return normalizeAutoPickIntegrationConfig(nextPermissions.autoPickIntegration);
}

async function syncAutoPickPluginCookie(config: AutoPickIntegrationConfig) {
  if (!config.pluginBaseUrl || !config.inboundApiKey) {
    return;
  }

  const url = new URL("/api/connections/cookie", `${config.pluginBaseUrl.replace(/\/+$/, "")}/`);
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": config.inboundApiKey,
    },
    body: JSON.stringify({
      cookie: config.maiyatianCookie,
      enabled: true,
    }),
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(String(data.error || data.reason || `同步脚本 Cookie 失败（${response.status}）`));
  }
}

async function findUserIdByManualIntegrationKey(apiKey: string) {
  const normalizedApiKey = normalizeComparableApiKey(apiKey);
  if (!normalizedApiKey) return null;

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
    if (config.inboundApiKey && normalizeComparableApiKey(config.inboundApiKey) === normalizedApiKey) {
      return user.id;
    }
  }

  return null;
}

export function generateAutoPickApiKey() {
  return `apk_${randomBytes(24).toString("hex")}`;
}

async function isManualIntegrationKeyTaken(apiKey: string, excludeUserId?: string) {
  const normalizedApiKey = normalizeComparableApiKey(apiKey);
  if (!normalizedApiKey) return false;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      permissions: true,
    },
  });

  for (const user of users) {
    if (excludeUserId && user.id === excludeUserId) {
      continue;
    }

    const permissions = user.permissions && typeof user.permissions === "object"
      ? user.permissions as AutoPickConfigPayload
      : {};
    const config = normalizeAutoPickIntegrationConfig(permissions.autoPickIntegration);
    if (config.inboundApiKey && normalizeComparableApiKey(config.inboundApiKey) === normalizedApiKey) {
      return true;
    }
  }

  return false;
}

export function getAutoPickApiKeyPrefix(apiKey: string) {
  return apiKey.slice(0, 12);
}

function normalizeWebhookBinding(input: unknown): AutoPickWebhookBinding | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const record = input as Record<string, unknown>;
  const key = normalizeComparableApiKey(String(record.key || ""));
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

async function getAutoPickPluginConnectionForUser(userId: string) {
  const config = await getAutoPickIntegrationConfigByUserId(userId);
  if (!config.pluginBaseUrl) {
    throw new Error("Auto-pick plugin base URL is not configured");
  }
  if (!config.inboundApiKey) {
    throw new Error("Auto-pick plugin api key is not configured");
  }
  return {
    baseUrl: config.pluginBaseUrl,
    apiKey: config.inboundApiKey,
  };
}

async function fetchAutoPickPluginJson<T>(userId: string, pathname: string, init?: RequestInit): Promise<{
  ok: boolean;
  status: number;
  data: T;
}> {
  const { baseUrl, apiKey } = await getAutoPickPluginConnectionForUser(userId);
  const url = new URL(pathname.replace(/^\//, ""), `${baseUrl.replace(/\/+$/, "")}/`);
  const response = await fetch(url.toString(), {
    ...init,
    headers: {
      Accept: "application/json",
      "X-API-Key": apiKey,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({})) as T;
  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

export function getRequestApiKey(headers: Headers, searchParams?: URLSearchParams) {
  const headerKey = headers.get("x-api-key") || headers.get("x-auto-pick-key");
  if (headerKey) return normalizeComparableApiKey(headerKey);

  const authorization = headers.get("authorization") || "";
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch?.[1]) {
    return normalizeComparableApiKey(bearerMatch[1]);
  }

  return normalizeComparableApiKey(searchParams?.get("key") || "");
}

export async function resolveAutoPickTargetUserId(apiKey?: string) {
  const normalizedApiKey = normalizeComparableApiKey(apiKey || "");
  if (normalizedApiKey) {
    const credential = await prisma.autoPickApiKey.findFirst({
      where: {
        keyHash: hashAutoPickApiKey(normalizedApiKey),
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

  if (normalizedApiKey) {
    const manualUserId = await findUserIdByManualIntegrationKey(normalizedApiKey);
    if (manualUserId) {
      return manualUserId;
    }
  }

  const bindings = getAutoPickWebhookBindings();

  if (normalizedApiKey) {
    const matched = bindings.find((item) => normalizeComparableApiKey(item.key) === normalizedApiKey);
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
  const normalizedApiKey = normalizeComparableApiKey(apiKey);
  if (!normalizedApiKey) return false;

  const existing = await prisma.autoPickApiKey.findFirst({
    where: {
      keyHash: hashAutoPickApiKey(normalizedApiKey),
      revokedAt: null,
    },
    select: { id: true },
  });

  if (existing?.id) {
    return true;
  }

  const manualUserId = await findUserIdByManualIntegrationKey(normalizedApiKey);
  if (manualUserId) {
    return true;
  }

  const bindings = getAutoPickWebhookBindings();
  return bindings.some((item) => normalizeComparableApiKey(item.key) === normalizedApiKey);
}

export async function markAutoPickApiKeyUsed(apiKey: string) {
  const normalizedApiKey = normalizeComparableApiKey(apiKey);
  if (!normalizedApiKey) return;

  await prisma.autoPickApiKey.updateMany({
    where: {
      keyHash: hashAutoPickApiKey(normalizedApiKey),
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

export async function deleteAutoPickOrderByIdentity(
  userId: string,
  lookup: { platform?: string; orderNo?: string; sourceId?: string }
) {
  const platform = String(lookup.platform || "").trim();
  const orderNo = String(lookup.orderNo || "").trim();
  const sourceId = String(lookup.sourceId || "").trim();

  if (!sourceId && (!platform || !orderNo)) {
    throw new Error("sourceId or platform and orderNo are required");
  }

  const existing = sourceId
    ? await prisma.autoPickOrder.findFirst({
      where: {
        userId,
        sourceId,
      },
      select: {
        id: true,
        platform: true,
        orderNo: true,
        status: true,
      },
    })
    : await prisma.autoPickOrder.findUnique({
      where: {
        userId_platform_orderNo: {
          userId,
          platform,
          orderNo,
        },
      },
      select: {
        id: true,
        platform: true,
        orderNo: true,
        status: true,
      },
    });

  if (!existing) {
    return { deleted: false, notFound: true };
  }

  // 如果订单已是终态（如已完成、已取消、已删除），则跳过修改和删除，直接保留
  if (isAutoPickOrderTerminalStatus(existing.status)) {
    return { deleted: false, id: existing.id, terminalSkipped: true };
  }

  // 将进行中订单的状态更新为“已取消”，防止物理删除造成数据丢失
  await prisma.autoPickOrder.update({
    where: { id: existing.id },
    data: { status: "已取消" },
  });

  emitAutoPickOrderEvent({
    type: "delete",
    userId,
    orderId: existing.id,
    orderNo: existing.orderNo,
    platform: existing.platform,
    at: new Date().toISOString(),
  });

  return { deleted: true, id: existing.id };
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
  const userInfo = input.userInfo && typeof input.userInfo === "object" && !Array.isArray(input.userInfo)
    ? input.userInfo as Record<string, unknown>
    : (input.user_info && typeof input.user_info === "object" && !Array.isArray(input.user_info)
        ? input.user_info as Record<string, unknown>
        : null);

  const unencryptedPhone = String(input.unencryptedPhone || input.unencrypted_phone || userInfo?.unencryptedPhone || userInfo?.unencrypted_phone || "").trim();
  const unencryptedMapAddress = String(input.unencryptedMapAddress || input.unencrypted_map_address || "").trim();
  const unencryptedAddress = String(input.unencryptedAddress || input.unencrypted_address || "").trim();
  const splitInputPhone = splitPrivacyPhoneValue(input.phone);
  const splitUserPhone = splitPrivacyPhoneValue(userInfo?.phone);
  const maskedPhone = readTrimmedCandidateValue([
    input.secret_phone,
    input.secretPhone,
    userInfo?.secret_phone,
    userInfo?.secretPhone,
    input.customerMaskedPhone,
    splitInputPhone.phone,
    splitUserPhone.phone,
  ]) || "";
  const phoneExtension = readTrimmedCandidateValue([
    input.customerPhoneExtension,
    input.phone_extend,
    userInfo?.phone_extend,
    splitInputPhone.extension,
    splitUserPhone.extension,
  ]) || "";
  const realName = String(input.customerName || input.real_name || userInfo?.real_name || userInfo?.realName || "").trim();
  const nickName = String(input.nick_name || userInfo?.nick_name || userInfo?.nickName || "").trim();

  const platform = String(input.platform || "").trim();
  const channelTag = String(input.channelTag || input.channel_tag || "").trim();
  const isJD = platform === "京东" || channelTag === "daojia" || String(input.source_tag || "").trim().toLowerCase() === "daojia" || String(input.goods_channel_tag || "").trim().toLowerCase() === "daojia";

  const shopIdValue = isJD
    ? (input.shop_id || input.shopId)
    : (
        input.shop_id
        || input.shopId
        || (
          input.delivery
          && typeof input.delivery === "object"
          && !Array.isArray(input.delivery)
          && ((input.delivery as Record<string, unknown>).shop_id || (input.delivery as Record<string, unknown>).shopId)
        )
        || input.merchant_id
        || input.merchantId
      );
  const shopId = String(shopIdValue || "").trim() || undefined;

  const normalized: AutoPickInboundOrder = {
    id: String(input.id || "").trim(),
    customerRemark: String(
      input.customerRemark
      || input.user_remark
      || input.userRemark
      || input.buyer_remark
      || input.buyerRemark
      || input.remark
      || input.memo
      || input.note
      || ""
    ).trim() || undefined,
    user_remark: input.user_remark !== undefined ? String(input.user_remark).trim() : undefined,
    userRemark: input.userRemark !== undefined ? String(input.userRemark).trim() : undefined,
    buyer_remark: input.buyer_remark !== undefined ? String(input.buyer_remark).trim() : undefined,
    buyerRemark: input.buyerRemark !== undefined ? String(input.buyerRemark).trim() : undefined,
    remark: input.remark !== undefined ? String(input.remark).trim() : undefined,
    memo: input.memo !== undefined ? String(input.memo).trim() : undefined,
    note: input.note !== undefined ? String(input.note).trim() : undefined,
    shopId,
    deliveryId: normalizeAutoPickDeliveryId(input.deliveryId),
    city: Number.isFinite(Number(input.city)) ? Number(input.city) : undefined,
    channelTag: channelTag || undefined,
    platform: platform || (isJD ? "京东" : ""),
    dailyPlatformSequence: Number(input.dailyPlatformSequence || 0),
    orderNo: String(input.orderNo || "").trim(),
    orderTime: String(input.orderTime || "").trim(),
    userAddress: String(
      unencryptedMapAddress
      || unencryptedAddress
      || input.userAddress
      || input.map_address
      || input.address
      || ""
    ).trim(),
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
      || input.channelAddress
      || input.store_address
      || input.merchant_address
      || input.channel_address
      || extend?.storeAddress
      || extend?.store_address
      || extend?.merchantAddress
      || extend?.merchant_address
      || extend?.channelAddress
      || extend?.channel_address
      || input.shop_name
      || input.shopName
      || ""
    ).trim() || undefined,
    rawShopAddress: String(
      input.rawShopAddress
      || input.shopAddress
      || input.storeAddress
      || input.merchantAddress
      || input.channelAddress
      || input.store_address
      || input.merchant_address
      || input.channel_address
      || extend?.storeAddress
      || extend?.store_address
      || extend?.merchantAddress
      || extend?.merchant_address
      || extend?.channelAddress
      || extend?.channel_address
      || input.shop_name
      || input.shopName
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
    delivery: (() => {
      const deliveryRecord = input.delivery && typeof input.delivery === "object"
        ? input.delivery as Record<string, unknown>
        : null;
      const rawPickupTime = isJD
        ? pickFirstValidTimeValue(
            input.pickup_time,
            input.pickupTime,
            input.picker_time,
            input.pickerTime,
            deliveryRecord?.pickup_time,
            deliveryRecord?.pickupTime,
            deliveryRecord?.pick_time,
            deliveryRecord?.pickTime,
            input.delivery_time,
          )
        : pickFirstValidTimeValue(
            deliveryRecord?.pickup_time,
            deliveryRecord?.pickupTime,
            deliveryRecord?.pick_time,
            deliveryRecord?.pickTime,
            input.pickup_time,
            input.pickupTime,
            input.picker_time,
            input.pickerTime,
            input.delivery_time,
          );
      const rawFinishedTime = deliveryRecord?.finished_time
        ?? deliveryRecord?.finishedTime
        ?? input.finishedTime
        ?? input.finished_time
        ?? input.completedAt;
      const completedTime = typeof rawFinishedTime === "string" && rawFinishedTime.includes("-")
        ? String(rawFinishedTime).trim()
        : (typeof rawFinishedTime === "string" || typeof rawFinishedTime === "number"
            ? parseUnixTimestampToOrderTime(rawFinishedTime)
            : undefined);

      const normalizedDelivery = {
        logisticName: String(deliveryRecord?.logisticName || deliveryRecord?.logistic_name || "").trim() || undefined,
        sendFee: Number.isFinite(Number(deliveryRecord?.sendFee ?? deliveryRecord?.send_fee))
          ? Number(deliveryRecord?.sendFee ?? deliveryRecord?.send_fee)
          : undefined,
        pickupTime: typeof rawPickupTime === "string" && rawPickupTime.includes("-")
          ? String(rawPickupTime).trim()
          : (typeof rawPickupTime === "string" || typeof rawPickupTime === "number"
              ? parseUnixTimestampToOrderTime(rawPickupTime)
              : undefined),
        track: String(deliveryRecord?.track || "").trim() || undefined,
        riderName: String(deliveryRecord?.riderName || deliveryRecord?.delivery_name || "").trim() || undefined,
        riderPhone: readRiderPhoneFromDelivery(deliveryRecord) || undefined,
        completedTime,
      };
      if (!normalizedDelivery.logisticName && normalizedDelivery.sendFee == null && !normalizedDelivery.pickupTime && !normalizedDelivery.track && !normalizedDelivery.riderName && !normalizedDelivery.riderPhone && !normalizedDelivery.completedTime) {
        return undefined;
      }
      return normalizedDelivery;
    })(),
    items: items.map((item) => {
      const current = typeof item === "object" && item ? item as Record<string, unknown> : {};
      return {
        productName: String(current.productName || "").trim(),
        productNo: String(current.productNo || "").trim() || undefined,
        quantity: Math.max(0, Number(current.quantity || 0)),
        thumb: String(current.thumb || "").trim() || undefined,
      };
    }),
    unencryptedPhone: unencryptedPhone || undefined,
    unencryptedMapAddress: unencryptedMapAddress || undefined,
    unencryptedAddress: unencryptedAddress || undefined,
    customerName: realName || nickName || undefined,
    customerPhone: unencryptedPhone || maskedPhone || splitInputPhone.phone || splitUserPhone.phone || undefined,
    customerMaskedPhone: maskedPhone || undefined,
    customerPhoneExtension: phoneExtension || undefined,
  };

  normalized.status = resolveAutoPickBusinessStatus(
    normalized.status,
    {
      ...input,
      channelTag: normalized.channelTag,
      channel_tag: normalized.channelTag,
    },
    normalized.userAddress,
    normalized.shopAddress,
  );

  if (!normalized.platform || !normalized.orderNo || !normalized.orderTime || !normalized.userAddress || !normalized.id) {
    return null;
  }

  if (!normalized.items?.length) {
    return null;
  }

  return normalized;
}

function getInvalidAutoPickOrderPayloadReason(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "payload is not an object";
  }

  const input = payload as Record<string, unknown>;
  const items = Array.isArray(input.items) ? input.items : [];
  const normalizedItems = items
    .map((item) => {
      const current = typeof item === "object" && item ? item as Record<string, unknown> : {};
      return {
        productName: String(current.productName || "").trim(),
        productNo: String(current.productNo || "").trim(),
        quantity: Math.max(0, Number(current.quantity || 0)),
      };
    })
    .filter((item) => item.productName && item.quantity > 0);

  const missingFields: string[] = [];
  if (!String(input.platform || "").trim()) missingFields.push("platform");
  if (!String(input.orderNo || "").trim()) missingFields.push("orderNo");
  if (!String(input.orderTime || "").trim()) missingFields.push("orderTime");
  if (!String(input.userAddress || "").trim()) missingFields.push("userAddress");
  if (!String(input.id || "").trim()) missingFields.push("id");
  if (normalizedItems.length === 0) missingFields.push("items");

  if (missingFields.length > 0) {
    return `missing or invalid fields: ${missingFields.join(", ")}`;
  }

  return "payload shape is invalid";
}

export async function upsertAutoPickOrder(userId: string, payload: AutoPickInboundOrder) {
  const normalized = normalizeAutoPickOrderPayload(payload);
  if (!normalized) {
    throw new Error(`Invalid auto-pick order payload: ${getInvalidAutoPickOrderPayloadReason(payload)}`);
  }

  let orderTime = parseAsShanghaiTime(normalized.orderTime);
  // 智能防错时区纠偏：如果订单的发生时间（orderTime）比当前服务器时间还要晚 1 小时以上，
  // 说明在客户端插件采集推送或格式化时重复累加了 8 小时。我们在此主动减去 8 小时进行回退校准，
  // 从而彻底根治由于时区溢出导致今天下午/晚上的订单在界面上跨天显示为“明天”的严重 Bug。
  if (orderTime.getTime() > Date.now() + 60 * 60 * 1000) {
    orderTime = new Date(orderTime.getTime() - 8 * 60 * 60 * 1000);
  }
  const normalizedItems = normalized.items
    ?.filter((item) => item.productName && Number(item.quantity) > 0)
    .map((item) => ({
      productName: item.productName || "",
      productNo: item.productNo || null,
      quantity: Math.max(1, Number(item.quantity || 1)),
      thumb: item.thumb || null,
      rawPayload: item as Record<string, unknown>,
    })) || [];

  if (!normalizedItems.length) {
    throw new Error("Order items are required");
  }

  let previousStatus: string | null = null;

  let order = await prisma.$transaction(async (tx) => {
    await ensureShopProductsForAutoPickOrder(tx, userId, normalized, normalizedItems);
    const resolvedInternalShop = await resolveAutoPickInternalShop(tx, userId, normalized);

    const existingCandidates = await tx.autoPickOrder.findMany({
      where: {
        userId,
        OR: [
          {
            platform: normalized.platform || "",
            orderNo: normalized.orderNo || "",
          },
          {
            orderNo: normalized.orderNo || "",
            OR: [
              { platform: "" },
              { platform: "未知" },
            ],
          },
          ...(normalized.id ? [{ sourceId: normalized.id }] : []),
        ],
      },
      orderBy: [
        { createdAt: "asc" },
        { id: "asc" },
      ],
      select: {
        id: true,
        sourceId: true,
        deliveryId: true,
        shopId: true,
        shopAddress: true,
        status: true,
        deliveryDeadline: true,
        deliveryTimeRange: true,
        delivery: true,
        customerRemark: true,
        createdAt: true,
        lastSyncedAt: true,
        rawPayload: true,
        items: {
          select: {
            productName: true,
            productNo: true,
            quantity: true,
            rawPayload: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    const existingCandidatesSorted = [...existingCandidates].sort((left, right) => (
      getAutoPickOrderRecencyTimestamp(right) - getAutoPickOrderRecencyTimestamp(left)
    ));

    const existing = existingCandidatesSorted[0] || null;
    previousStatus = existing?.status || null;
    const duplicateIds = existingCandidatesSorted
      .slice(1)
      .map((item) => item.id)
      .filter(Boolean);

    if (duplicateIds.length > 0) {
      await tx.autoPickOrderItem.deleteMany({
        where: {
          orderId: { in: duplicateIds },
        },
      });
      await tx.autoPickOrder.deleteMany({
        where: {
          id: { in: duplicateIds },
        },
      });
    }

    const sourceId = normalized.id || existing?.sourceId || "";
    const deliveryId = normalized.deliveryId || existing?.deliveryId || null;
    const shopId = normalized.shopId || existing?.shopId || null;
    const shopAddress = normalized.shopAddress || existing?.shopAddress || null;
    const shouldKeepTerminalStatus = isAutoPickOrderTerminalStatus(existing?.status) && !isAutoPickOrderTerminalStatus(normalized.status);
    const status = shouldKeepTerminalStatus
      ? existing?.status || null
      : (shouldPreservePickingStatus(existing || {}, normalized.status)
        || shouldPreserveRealtimeStatus(existing || {}, normalized.status))
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
    const nextRawPayload = mergeAutoPickSystemMeta(
      normalized as unknown as Record<string, unknown>,
      existing?.rawPayload
    );
    const existingSystemMeta = readAutoPickSystemMeta(existing?.rawPayload) || {};
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { resolvedShop: _previousResolvedShop, ...systemMetaWithoutResolvedShop } = existingSystemMeta;
    const nextSystemMeta: AutoPickSystemMeta = resolvedInternalShop
      ? {
          ...systemMetaWithoutResolvedShop,
          resolvedShop: {
            id: resolvedInternalShop.id,
            name: resolvedInternalShop.name,
          },
        }
      : systemMetaWithoutResolvedShop;
    const nextRawPayloadWithResolvedShop = {
      ...nextRawPayload,
      systemMeta: nextSystemMeta,
    };
    const existingItemPayloadMap = new Map<string, Array<unknown>>();
    for (const currentItem of existing?.items || []) {
      const signature = buildAutoPickOrderItemSignature(currentItem);
      const queue = existingItemPayloadMap.get(signature) || [];
      queue.push(currentItem.rawPayload);
      existingItemPayloadMap.set(signature, queue);
    }
    const items = normalizedItems.map((item) => {
      const signature = buildAutoPickOrderItemSignature(item);
      const preservedRawPayload = existingItemPayloadMap.get(signature)?.shift();
      return {
        productName: item.productName,
        productNo: item.productNo,
        quantity: item.quantity,
        thumb: item.thumb,
        rawPayload: asPrismaJsonValue(mergeAutoPickOrderItemRawPayload(item.rawPayload, preservedRawPayload)),
      };
    });

    const createData = {
      userId,
      sourceId,
      deliveryId,
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
      rawPayload: asPrismaJsonValue(nextRawPayloadWithResolvedShop),
      customerRemark: normalized.customerRemark ?? null,
      lastSyncedAt: new Date(),
    } satisfies Prisma.AutoPickOrderUncheckedCreateInput;

    const updateData = {
      sourceId,
      deliveryId,
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
      rawPayload: asPrismaJsonValue(nextRawPayloadWithResolvedShop),
      // 备注：优先使用平台同步回来的值；如果平台没有返回（null/空），则保留数据库中已有的备注，
      // 避免一键同步时把用户手动添加/平台历史备注覆盖为空。
      customerRemark: normalized.customerRemark || existing?.customerRemark || readCustomerRemarkFromRawPayload(existing?.rawPayload) || null,
      lastSyncedAt: new Date(),
    } satisfies Prisma.AutoPickOrderUncheckedUpdateInput;

    if (!existing) {
      return await tx.autoPickOrder.create({
        data: {
          ...createData,
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
    }

    return await tx.autoPickOrder.update({
      where: { id: existing.id },
      data: {
        ...updateData,
        items: {
          deleteMany: {},
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

  emitAutoPickOrderEvent({
    type: "upsert",
    userId,
    orderId: order.id,
    orderNo: order.orderNo,
    platform: order.platform,
    at: new Date().toISOString(),
  });

  const becameCompleted = isAutoPickOrderCompletedStatus(order.status) && !isAutoPickOrderCompletedStatus(previousStatus);
  if (becameCompleted) {
    const integrationConfig = await getAutoPickIntegrationConfigByUserId(userId);
    const defaultBrushCommission = integrationConfig.defaultBrushCommission ?? 0;
    await syncBrushOrderFromCompletedAutoPickOrder(userId, order.id, {
      commission: defaultBrushCommission,
    }).catch((brushError) => {
      console.error("Failed to sync brush order after webhook upsert:", brushError);
    });
    await syncAutoOutboundFromCompletedAutoPickOrder(userId, order.id).catch((outboundError) => {
      console.error("Failed to auto-create outbound after webhook upsert:", outboundError);
    });
  }

  const becameDelivering =
    isAutoPickOrderDeliveringStatus(order.status)
    && !isAutoPickOrderDeliveringStatus(previousStatus)
    && !isAutoPickPickupOrder(order.rawPayload, order.userAddress, order.shopAddress)
    && !isAutoPickOrderAbnormalStatus(order.status);
  const triggeredByMainSystem = Boolean(readAutoPickSystemMeta(order.rawPayload)?.mainSystemSelfDelivery?.triggered);

  if (becameDelivering && triggeredByMainSystem && !order.autoCompleteAt) {
    const integrationConfig = await getAutoPickIntegrationConfigByUserId(userId);
    const autoCompleteAt = estimateAutoCompleteAtForOrder(order, integrationConfig.selfDeliveryTiming);

    if (autoCompleteAt) {
      order = await prisma.autoPickOrder.update({
        where: { id: order.id },
        data: {
          autoCompleteAt,
          lastSyncedAt: new Date(),
        },
        include: {
          items: {
            orderBy: { createdAt: "asc" },
          },
        },
      });

      const { ensureAutoCompleteJob } = await import("@/lib/autoPickAutoComplete");
      await ensureAutoCompleteJob({
        userId,
        orderId: order.id,
        dueAt: autoCompleteAt,
      });

      emitAutoPickOrderEvent({
        type: "upsert",
        userId,
        orderId: order.id,
        orderNo: order.orderNo,
        platform: order.platform,
        at: new Date().toISOString(),
      });
    }
  }

  return order;
}

export async function enrichAutoPickInboundOrderIfNeeded(
  userId: string,
  current: AutoPickInboundOrder,
  cookie?: string | null,
  options?: { force?: boolean }
) {
  try {
    const activeCookie = cookie || await getMaiyatianCookieForUser(userId).catch(() => null);
    if (!activeCookie) {
      return current;
    }

    const currentStatusDisplay = getBaseAutoPickStatusDisplay(current.status);
    const canEnrich =
      options?.force || (
        currentStatusDisplay !== "已取消" &&
        currentStatusDisplay !== "已删除" &&
        currentStatusDisplay !== "同步中"
      );

    if (!canEnrich) {
      return current;
    }

    const existing = await prisma.autoPickOrder.findFirst({
      where: {
        userId,
        platform: current.platform || "",
        orderNo: current.orderNo || "",
      },
      select: {
        id: true,
        customerRemark: true,
        rawPayload: true,
        delivery: true,
      },
    });

    const hasCustomerName = Boolean(
      current.customerName
      || readCustomerNameFromRawPayload(current)
      || readCustomerNameFromRawPayload(existing?.rawPayload)
    );
    const hasEncryptedCustomerPhone = Boolean(
      current.customerPhone
      || readCustomerPhoneFromRawPayload(current)
      || readCustomerPhoneFromRawPayload(existing?.rawPayload)
    );
    const hasMaskedCustomerPhone = Boolean(
      current.customerMaskedPhone
      || readCustomerMaskedPhoneFromRawPayload(current)
      || readCustomerMaskedPhoneFromRawPayload(existing?.rawPayload)
    );
    const hasRiderPhone = Boolean(
      readRiderPhoneFromDelivery(current.delivery)
      || readRiderPhoneFromRawPayload(current)
      || readRiderPhoneFromDelivery(existing?.delivery)
      || readRiderPhoneFromRawPayload(existing?.rawPayload)
    );

    const isAccepted = currentStatusDisplay === "待配送" || currentStatusDisplay === "配送中";

    const shouldEnrichOrderDetail =
      !existing
      || !existing.customerRemark
      || !hasCustomerName
      || !hasEncryptedCustomerPhone
      || !hasMaskedCustomerPhone
      || (isAccepted && !hasRiderPhone);

    if (shouldEnrichOrderDetail) {
      console.log(`[AutoEnrich] Synchronously enriching order ${current.orderNo} (status: ${current.status})`);
      await enrichMaiyatianOrderByCookie(activeCookie, current).catch((e) => {
        console.warn(`[AutoEnrich] Failed to enrich order ${current.orderNo} synchronously:`, e);
      });
    }
  } catch (error) {
    console.error("[AutoEnrich] Error during synchronous order enrichment:", error);
  }
  return current;
}

export async function syncAutoPickOrdersFromPlugin(userId: string, options: { status?: AutoPickSyncStatus; date?: string }) {
  const pluginResult = options.date
    ? await fetchAutoPickPluginJson<AutoPickInboundOrder[]>(userId, `/all-orders/${encodeURIComponent(options.date)}`)
    : await fetchAutoPickPluginJson<AutoPickInboundOrder[]>(userId, `/list-orders/${encodeURIComponent(options.status || "confirm")}`);

  if (!pluginResult.ok || !Array.isArray(pluginResult.data)) {
    const errorPayload = (!Array.isArray(pluginResult.data) && pluginResult.data && typeof pluginResult.data === "object")
      ? pluginResult.data as Record<string, unknown>
      : null;
    const reason = errorPayload
      ? String(errorPayload.error || errorPayload.reason || "")
      : "";
    throw new Error(reason || `Auto-pick plugin request failed (${pluginResult.status})`);
  }

  const cookie = await getMaiyatianCookieForUser(userId).catch(() => null);
  const normalized = pluginResult.data;

  const results = [];
  let skipped = 0;
  const skippedOrders: Array<{
    id: string;
    orderNo: string;
    platform: string;
    reason: string;
  }> = [];
  for (const order of normalized) {
    const current = normalizeAutoPickOrderPayload(order);
    if (!current) {
      skipped += 1;
      const reason = getInvalidAutoPickOrderPayloadReason(order);
      skippedOrders.push({
        id: String(order.id || ""),
        orderNo: String(order.orderNo || ""),
        platform: String(order.platform || ""),
        reason,
      });
      console.warn("Skip invalid auto-pick order during sync", {
        userId,
        reason,
        orderNo: String(order.orderNo || ""),
        id: String(order.id || ""),
        platform: String(order.platform || ""),
      });
      continue;
    }
    try {
      if (isAutoPickOrderDeletedStatus(current.status)) {
        await deleteAutoPickOrderByIdentity(userId, {
          platform: String(current.platform || ""),
          orderNo: String(current.orderNo || ""),
        });
        continue;
      }

        await enrichAutoPickInboundOrderIfNeeded(userId, current, cookie, { force: true });

      results.push(await upsertAutoPickOrder(userId, current));
    } catch (error) {
      skipped += 1;
      const reason = error instanceof Error ? error.message : String(error);
      skippedOrders.push({
        id: String(current.id || ""),
        orderNo: String(current.orderNo || ""),
        platform: String(current.platform || ""),
        reason,
      });
      console.warn("Skip auto-pick order during upsert", {
        userId,
        reason,
        orderNo: String(current.orderNo || ""),
        id: String(current.id || ""),
        platform: String(current.platform || ""),
      });
    }
  }

  return {
    count: results.length,
    skipped,
    skippedOrders,
    orders: results,
  };
}

async function syncAutoPickConfirmOrdersByCookieListener(userId: string, cookie: string) {
  const orders = await fetchSimplifiedMaiyatianOrderListByCookie(cookie, "confirm");
  for (const order of orders) {
    const normalized = normalizeAutoPickOrderPayload(order);
    if (!normalized) {
      continue;
    }

    if (isAutoPickOrderDeletedStatus(normalized.status)) {
      await deleteAutoPickOrderByIdentity(userId, {
        platform: String(normalized.platform || ""),
        orderNo: String(normalized.orderNo || ""),
      }).catch(() => null);
      continue;
    }

    await enrichAutoPickInboundOrderIfNeeded(userId, normalized, cookie);
    await upsertAutoPickOrder(userId, normalized).catch((error) => {
      console.error("Auto-pick confirm listener upsert failed:", {
        userId,
        orderNo: normalized.orderNo,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}

async function syncAutoPickChangedOrdersByCookieListener(userId: string, cookie: string, state: AutoPickCookieListenerState) {
  const date = formatLocalDate(new Date());
  const orders = await fetchSimplifiedAllMaiyatianOrdersByDateByCookie(cookie, date);

  for (const order of orders) {
    const normalized = normalizeAutoPickOrderPayload(order);
    if (!normalized) {
      continue;
    }

    const signature = buildAutoPickOrderStateSignature(normalized);
    const key = `${userId}:${normalized.platform}:${normalized.orderNo}`;
    const previousSignature = state.stateSignatures.get(key);

    if (previousSignature === signature) {
      continue;
    }

    if (isAutoPickOrderDeletedStatus(normalized.status)) {
      await deleteAutoPickOrderByIdentity(userId, {
        platform: String(normalized.platform || ""),
        orderNo: String(normalized.orderNo || ""),
      }).catch(() => null);
      state.stateSignatures.set(key, signature);
      continue;
    }

    await enrichAutoPickInboundOrderIfNeeded(userId, normalized, cookie);
    await upsertAutoPickOrder(userId, normalized).catch((error) => {
      console.error("Auto-pick changed-state listener upsert failed:", {
        userId,
        orderNo: normalized.orderNo,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    state.stateSignatures.set(key, signature);
  }
}

async function runAutoPickCookieListenerCycle() {
  const state = getAutoPickCookieListenerState();
  if (state.running) {
    return;
  }

  state.running = true;
  try {
    const users = await listAutoPickCookieUsers();
    for (const user of users) {
      await syncAutoPickConfirmOrdersByCookieListener(user.id, user.cookie).catch((error) => {
        console.error("Auto-pick confirm listener failed:", {
          userId: user.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });

      if (Date.now() - state.lastStateSyncAt >= AUTO_PICK_STATE_LISTEN_INTERVAL_MS) {
        await syncAutoPickChangedOrdersByCookieListener(user.id, user.cookie, state).catch((error) => {
          console.error("Auto-pick changed-state listener failed:", {
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
    }

    if (Date.now() - state.lastStateSyncAt >= AUTO_PICK_STATE_LISTEN_INTERVAL_MS) {
      state.lastStateSyncAt = Date.now();
    }
  } finally {
    state.running = false;
  }
}

export async function startAutoPickCookieListener() {
  const state = getAutoPickCookieListenerState();
  if (state.started) {
    return;
  }

  state.started = true;
  await runAutoPickCookieListenerCycle();
  state.timer = setInterval(() => {
    void runAutoPickCookieListenerCycle();
  }, AUTO_PICK_CONFIRM_LISTEN_INTERVAL_MS);
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
  const statusHint = String(input.statusHint || "").trim().toLowerCase();

  if (!platform || !orderNo) {
    return null;
  }

  return {
    platform,
    orderNo,
    pickRemainingSeconds: Number.isFinite(pickRemainingSeconds) ? Math.max(0, pickRemainingSeconds) : undefined,
    pickCompleted,
    statusHint: statusHint || undefined,
  };
}

export function parseAutoPickProgressPayload(payload: unknown) {
  return normalizeAutoPickProgressPayload(payload);
}

function buildAutoPickOrderStateSignature(order: AutoPickInboundOrder) {
  return JSON.stringify({
    platform: String(order.platform || "").trim(),
    orderNo: String(order.orderNo || "").trim(),
    status: String(order.status || "").trim(),
    deliveryDeadline: String(order.deliveryDeadline || "").trim(),
    deliveryTimeRange: String(order.deliveryTimeRange || "").trim(),
    actualPaid: Number(order.actualPaid || 0),
    expectedIncome: Number(order.expectedIncome || 0),
    platformCommission: Number(order.platformCommission || 0),
    userAddress: String(order.userAddress || "").trim(),
    delivery: order.delivery || null,
    items: Array.isArray(order.items)
      ? order.items.map((item) => ({
          productName: String(item.productName || "").trim(),
          productNo: String(item.productNo || "").trim(),
          quantity: Number(item.quantity || 0),
        }))
      : [],
  });
}

function buildProgressStatus(progress: AutoPickProgressPayload, currentStatus?: string | null) {
  const statusHint = String(progress.statusHint || "").trim().toLowerCase();
  if (statusHint === "done") {
    return "done";
  }
  if (statusHint === "delivering") {
    return "delivering";
  }
  if (statusHint === "pickup") {
    return "pickup";
  }
  if (statusHint === "delivery") {
    return "delivery";
  }
  if (statusHint === "confirm") {
    return "confirm";
  }
  if (statusHint === "subscribe" || statusHint === "remind") {
    return "delivery";
  }
  if (statusHint === "meal") {
    return "已拣货";
  }
  if (
    statusHint === "expect"
  ) {
    return "expect";
  }
  if (
    statusHint === "cancel"
    || statusHint === "close"
    || statusHint === "closed"
  ) {
    return "cancel";
  }

  const currentPriority = getAutoPickStatusPriority(currentStatus);
  if (progress.pickCompleted) {
    if (currentPriority >= getAutoPickStatusPriority("delivery")) {
      return currentStatus || "已拣货";
    }
    return "已拣货";
  }

  if (typeof progress.pickRemainingSeconds === "number") {
    if (currentPriority >= getAutoPickStatusPriority("delivery")) {
      return currentStatus || "拣货中";
    }
    const remainingMinutes = Math.ceil(progress.pickRemainingSeconds / 60);
    if (remainingMinutes <= 0) {
      return "拣货中";
    }
    return `拣货中（约${remainingMinutes}分钟）`;
  }

  return currentStatus || "拣货中";
}

function shouldRefreshAutoPickOrderOnProgressStatusHint(statusHint?: string | null) {
  const normalized = String(statusHint || "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return [
    "confirm",
    "subscribe",
    "delivery",
    "pickup",
    "delivering",
    "done",
    "expect",
    "cancel",
    "rollback",
    "close",
    "closed",
    "remind",
    "meal",
  ].includes(normalized);
}

function hasDeliveryValue(value: unknown) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length > 0);
}

function readAutoPickRawPayloadRecord(rawPayload: unknown) {
  return rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
    ? rawPayload as Record<string, unknown>
    : {};
}

function buildAutoPickOrderItemSignature(input: {
  productName?: string | null;
  productNo?: string | null;
  quantity?: number | null;
}) {
  return [
    String(input.productName || "").trim().toLowerCase(),
    String(input.productNo || "").trim().toLowerCase(),
    Math.max(1, Number(input.quantity || 1) || 1),
  ].join("::");
}

function readManualMatchedProductFromOrderItemRawPayload(rawPayload: unknown) {
  const record = readAutoPickRawPayloadRecord(rawPayload);
  const candidate = record.manualMatchedProduct;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  const manual = candidate as AutoPickManualMatchedProductMeta;
  const id = String(manual.id || "").trim();
  const name = String(manual.name || "").trim();
  const sourceType = manual.sourceType === "shopProduct" ? "shopProduct" as const : "product" as const;
  const shopProductId = String(manual.shopProductId || "").trim() || null;
  if (!id || !name || sourceType !== "shopProduct" || !shopProductId) {
    return null;
  }

  return {
    id,
    name,
    sku: String(manual.sku || "").trim() || null,
    image: String(manual.image || "").trim() || null,
    sourceType,
    shopProductId,
    shopName: String(manual.shopName || "").trim() || null,
    bundleItems: Array.isArray(manual.bundleItems) ? manual.bundleItems : undefined,
  };
}

function mergeAutoPickOrderItemRawPayload(
  basePayload: Record<string, unknown>,
  existingRawPayload: unknown
) {
  const nextPayload = { ...basePayload };
  const manualMatchedProduct = readManualMatchedProductFromOrderItemRawPayload(existingRawPayload);
  if (!manualMatchedProduct) {
    return nextPayload;
  }

  return {
    ...nextPayload,
    manualMatchedProduct,
  };
}

function readAutoPickPickProgress(rawPayload: unknown) {
  const record = readAutoPickRawPayloadRecord(rawPayload);
  const progress = record.pickProgress;
  if (!progress || typeof progress !== "object" || Array.isArray(progress)) {
    return null;
  }
  return progress as {
    pickRemainingSeconds?: number | null;
    pickCompleted?: boolean;
    updatedAt?: string;
  };
}

function shouldPreservePickingStatus(existing: {
  status?: string | null;
  rawPayload?: unknown;
}, incomingStatus?: string | null) {
  const progress = readAutoPickPickProgress(existing.rawPayload);
  if (!progress || (!progress.pickCompleted && typeof progress.pickRemainingSeconds !== "number")) {
    return false;
  }

  const normalizedIncoming = String(incomingStatus || "").trim();
  if (!normalizedIncoming) {
    return false;
  }

  const incomingBaseStatus = getBaseAutoPickStatusDisplay(normalizedIncoming);

  return incomingBaseStatus === "待处理" || incomingBaseStatus === "同步中";
}

function getAutoPickStatusPriority(status?: string | null) {
  const baseStatus = getBaseAutoPickStatusDisplay(status);
  switch (baseStatus) {
    case "同步中":
      return 0;
    case "待处理":
      return 1;
    case "已拣货":
      return 2;
    case "待配送":
      return 3;
    case "配送中":
      return 4;
    case "已完成":
      return 5;
    case "已取消":
    case "已删除":
      return 6;
    default:
      return 0;
  }
}

function shouldPreserveRealtimeStatus(existing: {
  status?: string | null;
  rawPayload?: unknown;
}, incomingStatus?: string | null) {
  const record = readAutoPickRawPayloadRecord(existing.rawPayload);
  const wsStatusHint = String(record.wsStatusHint || "").trim().toLowerCase();
  if (!wsStatusHint) {
    return false;
  }

  return getAutoPickStatusPriority(existing.status) > getAutoPickStatusPriority(incomingStatus);
}

function toAutoPickBaseProductName(value: string | null | undefined) {
  return String(value || "")
    .split(/[|｜]/, 1)[0]
    .trim();
}

function toNormalizedText(value: string | null | undefined) {
  return toAutoPickBaseProductName(value)
    .trim()
    .replace(/[（(].*?[)）]/g, " ")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function normalizeAutoPickSkuForMatch(value: string | null | undefined) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) {
    return "";
  }

  const compact = raw.replace(/\s+/g, "");
  const digitsOnly = compact.replace(/\D+/g, "");
  if (digitsOnly) {
    return digitsOnly;
  }

  return compact.replace(/[^A-Z0-9]+/g, "");
}

function splitCompositeAutoPickSku(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) {
    return [];
  }

  return raw
    .split(/[+＋]/)
    .map((part) => normalizeAutoPickSkuForMatch(part))
    .filter(Boolean);
}

function normalizeAutoPickDeliveryId(value: unknown) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized === "0") {
    return undefined;
  }
  return normalized;
}

function isJdPlatform(platform: string | null | undefined) {
  const normalized = String(platform || "").trim().toLowerCase();
  return normalized === "jd" || normalized.includes("jingdong") || normalized.includes("jddj") || normalized.includes("京东");
}

function normalizeShopProductSkuForPlatformMatch(
  platform: string | null | undefined,
  item: { sku?: string | null; jdSkuId?: string | null }
) {
  if (isJdPlatform(platform)) {
    return normalizeAutoPickSkuForMatch(item.jdSkuId || item.sku);
  }
  return normalizeAutoPickSkuForMatch(item.sku || item.jdSkuId);
}

async function findExistingShopProductByShopAndSku(
  tx: Prisma.TransactionClient,
  shopId: string,
  sku: string | null | undefined,
  platform?: string | null
) {
  const normalizedSku = normalizeAutoPickSkuForMatch(sku);
  if (!shopId || !normalizedSku) {
    return null;
  }

  if (isJdPlatform(platform)) {
    const directJdHit = await tx.shopProduct.findFirst({
      where: {
        shopId,
        jdSkuId: String(sku || "").trim(),
      },
      select: {
        id: true,
        productId: true,
        sourceProductId: true,
        sku: true,
        jdSkuId: true,
        productName: true,
      },
    });
    if (directJdHit) {
      return directJdHit;
    }
  }

  const directHit = await tx.shopProduct.findFirst({
    where: {
      shopId,
      sku: String(sku || "").trim(),
    },
    select: {
      id: true,
      productId: true,
      sourceProductId: true,
      sku: true,
      jdSkuId: true,
      productName: true,
    },
  });
  if (directHit) {
    return directHit;
  }

  const candidates = await tx.shopProduct.findMany({
    where: {
      shopId,
    },
    select: {
      id: true,
      productId: true,
      sourceProductId: true,
      sku: true,
      jdSkuId: true,
      productName: true,
    },
  });

  return candidates.find((item) => normalizeShopProductSkuForPlatformMatch(platform, item) === normalizedSku) || null;
}

async function resolveAutoPickInternalShop(
  tx: Prisma.TransactionClient,
  userId: string,
  normalized: Pick<AutoPickInboundOrder, "shopId" | "rawShopName" | "rawShopAddress">
) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { permissions: true },
  });

  const mappedShopName = findMappedShopNameFromAutoPickConfig(
    normalizeExternalId(normalized.shopId) || null,
    String(normalized.rawShopName || "").trim() || null,
    String(normalized.rawShopAddress || "").trim() || null,
    user?.permissions
  );

  const shops = await tx.shop.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      address: true,
      externalId: true,
    },
  });

  if (mappedShopName) {
    const mappedShop = findMatchingShopRecord(shops, {
      name: mappedShopName,
    });
    if (mappedShop) {
      return {
        id: mappedShop.id,
        name: mappedShop.name || mappedShopName,
      };
    }
  }

  const shop = findMatchingShopRecord(shops, {
    externalId: normalized.shopId,
    name: normalized.rawShopName,
    address: normalizeShopAddress(normalized.rawShopAddress),
  });
  if (shop) {
    return {
      id: shop.id,
      name: shop.name || "",
    };
  }

  const rawAddressKey = normalizeShopAddressKey(normalized.rawShopAddress);
  if (!rawAddressKey) {
    return null;
  }

  const partialAddressMatchedShops = shops.filter((item) => {
    const currentAddressKey = normalizeShopAddressKey(item.address);
    if (!currentAddressKey) {
      return false;
    }
    return currentAddressKey.includes(rawAddressKey) || rawAddressKey.includes(currentAddressKey);
  });

  if (partialAddressMatchedShops.length === 1) {
    return {
      id: partialAddressMatchedShops[0].id,
      name: partialAddressMatchedShops[0].name || "",
    };
  }

  return null;
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
  void tx;
  void userId;
  void normalized;
  void items;
}

export async function applyAutoPickProgress(userId: string, payload: unknown) {
  const progress = normalizeAutoPickProgressPayload(payload);
  if (!progress) {
    throw new Error("Invalid progress payload");
  }

  let order = await prisma.autoPickOrder.findFirst({
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
    const refreshedOrder = await refreshAutoPickOrderFromPlugin(userId, {
      platform: progress.platform,
      orderNo: progress.orderNo,
      orderTime: new Date(),
    }).catch(() => null);

    if (refreshedOrder) {
      order = refreshedOrder;
    }
  }

  if (!order) {
    throw new Error("Order not found");
  }

  if (shouldRefreshAutoPickOrderOnProgressStatusHint(progress.statusHint)) {
    const refreshedOrder = await refreshAutoPickOrderFromPlugin(userId, {
      id: order.sourceId,
      platform: progress.platform,
      orderNo: progress.orderNo,
      orderTime: order.orderTime,
    }).catch(() => null);

    if (refreshedOrder) {
      return refreshedOrder;
    }
  }

  if (isAutoPickOrderTerminalStatus(order.status)) {
    const existingOrder = await prisma.autoPickOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: {
        items: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
    emitAutoPickOrderEvent({
      type: "progress",
      userId,
      orderId: existingOrder.id,
      orderNo: existingOrder.orderNo,
      platform: existingOrder.platform,
      at: new Date().toISOString(),
    });
    return existingOrder;
  }

  const nextRawPayload = order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)
    ? {
        ...(order.rawPayload as Record<string, unknown>),
        pickProgress: {
          pickRemainingSeconds: progress.pickRemainingSeconds ?? null,
          pickCompleted: Boolean(progress.pickCompleted),
          updatedAt: new Date().toISOString(),
        },
        wsStatusHint: progress.statusHint || null,
      }
    : {
        pickProgress: {
          pickRemainingSeconds: progress.pickRemainingSeconds ?? null,
          pickCompleted: Boolean(progress.pickCompleted),
          updatedAt: new Date().toISOString(),
        },
        wsStatusHint: progress.statusHint || null,
      };

  const updatedOrder = await prisma.autoPickOrder.update({
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

  emitAutoPickOrderEvent({
    type: "progress",
    userId,
    orderId: updatedOrder.id,
    orderNo: updatedOrder.orderNo,
    platform: updatedOrder.platform,
    at: new Date().toISOString(),
  });

  return updatedOrder;
}

export async function refreshAutoPickOrderFromPlugin(
  userId: string,
  lookup: { id?: string; platform?: string; orderNo?: string; orderTime?: Date | string | null }
) {
  const cookie = await getMaiyatianCookieForUser(userId);
  const fallbackPlatform = String(lookup.platform || "").trim();
  const fallbackOrderNo = String(lookup.orderNo || "").trim();
  const canTrustLookupPlatform = Boolean(fallbackPlatform && fallbackPlatform !== "未知");

  const sourceId = String(lookup.id || "").trim();
  if (sourceId) {
    const detailOrder = await fetchSimplifiedMaiyatianOrderDetailByCookie(cookie, sourceId).catch(() => null);
    if (detailOrder) {
      const normalizedDetailOrder = normalizeAutoPickOrderPayload({
        ...detailOrder,
        platform: String(detailOrder.platform || "").trim() || fallbackPlatform,
        orderNo: String(detailOrder.orderNo || "").trim() || fallbackOrderNo,
      });
      if (normalizedDetailOrder) {
        const shouldReconcileWithActiveList = isAutoPickOrderAbnormalStatus(normalizedDetailOrder.status)
          || !String(normalizedDetailOrder.deliveryId || "").trim();
        if (shouldReconcileWithActiveList) {
          const fallbackLookup = {
            id: normalizedDetailOrder.id || sourceId,
            platform: normalizedDetailOrder.platform || fallbackPlatform,
            orderNo: normalizedDetailOrder.orderNo || fallbackOrderNo,
            orderTime: lookup.orderTime,
          };
          const fallbackMatchedFromRawActive = await findAutoPickOrderFromRawActiveStatusLists(cookie, fallbackLookup);
          const targetDate = lookup.orderTime ? formatLocalDate(lookup.orderTime) : formatLocalDate(new Date());
          const fallbackMatchedFromDate = (await fetchSimplifiedAllMaiyatianOrdersByDateByCookie(cookie, targetDate))
            .map((order) => normalizeAutoPickOrderPayload(order))
            .filter((order): order is AutoPickInboundOrder => Boolean(order))
            .find((order) => {
              if (fallbackLookup.id && order.id === fallbackLookup.id) return true;
              if (order.orderNo !== fallbackLookup.orderNo) {
                return false;
              }
              if (!canTrustLookupPlatform) {
                return true;
              }
              return order.platform === fallbackLookup.platform;
            });
          const fallbackMatched = fallbackMatchedFromRawActive || fallbackMatchedFromDate || await findAutoPickOrderFromActiveStatusLists(cookie, fallbackLookup);

          if (fallbackMatched) {
            normalizedDetailOrder.deliveryId = normalizedDetailOrder.deliveryId || fallbackMatched.deliveryId;
            normalizedDetailOrder.shopId = normalizedDetailOrder.shopId || fallbackMatched.shopId;
            normalizedDetailOrder.shopAddress = normalizedDetailOrder.shopAddress || fallbackMatched.shopAddress;
            normalizedDetailOrder.rawShopAddress = normalizedDetailOrder.rawShopAddress || fallbackMatched.rawShopAddress;
            normalizedDetailOrder.deliveryDeadline = normalizedDetailOrder.deliveryDeadline || fallbackMatched.deliveryDeadline;
            normalizedDetailOrder.deliveryTimeRange = normalizedDetailOrder.deliveryTimeRange || fallbackMatched.deliveryTimeRange;
            normalizedDetailOrder.delivery = normalizedDetailOrder.delivery || fallbackMatched.delivery;
            if (
              isAutoPickOrderAbnormalStatus(normalizedDetailOrder.status)
              && !isAutoPickOrderAbnormalStatus(fallbackMatched.status)
            ) {
              normalizedDetailOrder.status = fallbackMatched.status;
            }
          }
        }

        if (isAutoPickOrderDeletedStatus(normalizedDetailOrder.status)) {
          await deleteAutoPickOrderByIdentity(userId, {
            platform: normalizedDetailOrder.platform || fallbackPlatform,
            orderNo: normalizedDetailOrder.orderNo || fallbackOrderNo,
          });
          return null;
        }
        return await upsertAutoPickOrder(userId, normalizedDetailOrder);
      }
    }
  }

  const targetDate = lookup.orderTime ? formatLocalDate(lookup.orderTime) : formatLocalDate(new Date());
  const orders = await fetchSimplifiedAllMaiyatianOrdersByDateByCookie(cookie, targetDate);
  const matched = orders
    .map((order) => normalizeAutoPickOrderPayload(order))
    .filter((order): order is AutoPickInboundOrder => Boolean(order))
    .find((order) => {
      if (lookup.id && order.id === lookup.id) return true;
      if (order.orderNo !== lookup.orderNo) {
        return false;
      }
      if (!canTrustLookupPlatform) {
        return true;
      }
      return order.platform === fallbackPlatform;
    });

  if (!matched) {
    const fallbackMatched = await findAutoPickOrderFromActiveStatusLists(cookie, lookup);
    if (!fallbackMatched) {
      return null;
    }

    const normalizedFallbackMatched = normalizeAutoPickOrderPayload(fallbackMatched);
    if (!normalizedFallbackMatched) {
      return null;
    }

    if (isAutoPickOrderDeletedStatus(normalizedFallbackMatched.status)) {
      await deleteAutoPickOrderByIdentity(userId, {
        platform: normalizedFallbackMatched.platform || String(lookup.platform || ""),
        orderNo: normalizedFallbackMatched.orderNo || String(lookup.orderNo || ""),
      });
      return null;
    }

    return await upsertAutoPickOrder(userId, normalizedFallbackMatched);
  }

  if (isAutoPickOrderDeletedStatus(matched.status)) {
    await deleteAutoPickOrderByIdentity(userId, {
      platform: matched.platform || String(lookup.platform || ""),
      orderNo: matched.orderNo || String(lookup.orderNo || ""),
    });
    return null;
  }

  return await upsertAutoPickOrder(userId, matched);
}

async function findAutoPickOrderFromActiveStatusLists(
  cookie: string,
  lookup: { id?: string; platform?: string; orderNo?: string; orderTime?: Date | string | null }
) {
  const fallbackPlatform = String(lookup.platform || "").trim();
  const fallbackOrderNo = String(lookup.orderNo || "").trim();
  const canTrustLookupPlatform = Boolean(fallbackPlatform && fallbackPlatform !== "未知");
  const activeStatuses: AutoPickSyncStatus[] = [
    "confirm",
    "subscribe",
    "delivery",
    "pickup",
    "delivering",
    "expect",
    "remind",
    "meal",
  ];

  for (const status of activeStatuses) {
    const orders = await fetchSimplifiedMaiyatianOrderListByCookie(cookie, status).catch(() => []);
    const matched = orders.find((order) => {
      if (lookup.id && order.id === lookup.id) return true;
      if (order.orderNo !== fallbackOrderNo) {
        return false;
      }
      if (!canTrustLookupPlatform) {
        return true;
      }
      return order.platform === fallbackPlatform;
    });

    if (matched) {
      return matched;
    }
  }

  return null;
}

export async function backfillPersistedAutoPickOrderFields(
  userId: string,
  options?: { orderIds?: string[] }
) {
  const targetOrderIds = options && Array.isArray(options.orderIds)
    ? options.orderIds.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  const isForce = targetOrderIds.length > 0;

  const orders = await prisma.autoPickOrder.findMany({
    where: {
      userId,
      ...(isForce
        ? { id: { in: targetOrderIds } }
        : {
            OR: [
              { shopId: null },
              { shopAddress: null },
              { deliveryTimeRange: null },
              { expectedIncome: null },
              { platform: "" },
              { platform: "未知" },
            ],
          }),
    },
    select: {
      id: true,
      rawPayload: true,
      shopId: true,
      shopAddress: true,
      deliveryTimeRange: true,
      expectedIncome: true,
      platform: true,
      platformCommission: true,
    },
  });

  let updatedCount = 0;

  for (const order of orders) {
    const normalized = normalizeAutoPickOrderPayload(order.rawPayload);
    if (!normalized) {
      continue;
    }

    const nextData: Prisma.AutoPickOrderUpdateInput = {};

    // 门店 ID 更新逻辑
    if (normalized.shopId) {
      if (isForce) {
        if (order.shopId !== normalized.shopId) {
          nextData.shopId = normalized.shopId;
        }
      } else {
        if (!order.shopId) {
          nextData.shopId = normalized.shopId;
        }
      }
    }

    // 门店地址更新逻辑
    if (normalized.shopAddress) {
      if (isForce) {
        if (order.shopAddress !== normalized.shopAddress) {
          nextData.shopAddress = normalized.shopAddress;
        }
      } else {
        if (!order.shopAddress) {
          nextData.shopAddress = normalized.shopAddress;
        }
      }
    }

    // 配送时间范围更新逻辑
    if (normalized.deliveryTimeRange) {
      if (isForce) {
        if (order.deliveryTimeRange !== normalized.deliveryTimeRange) {
          nextData.deliveryTimeRange = normalized.deliveryTimeRange;
        }
      } else {
        if (!order.deliveryTimeRange) {
          nextData.deliveryTimeRange = normalized.deliveryTimeRange;
        }
      }
    }

    // 预估收益更新逻辑
    if (Number.isFinite(Number(normalized.expectedIncome))) {
      const nextVal = Math.round(Number(normalized.expectedIncome));
      if (isForce) {
        if (order.expectedIncome !== nextVal) {
          nextData.expectedIncome = nextVal;
        }
      } else {
        if (order.expectedIncome == null) {
          nextData.expectedIncome = nextVal;
        }
      }
    }

    // 平台更新逻辑
    const existingPlatform = String(order.platform || "").trim();
    const normalizedPlatform = String(normalized.platform || "").trim();
    if (normalizedPlatform) {
      if (isForce) {
        if (existingPlatform !== normalizedPlatform) {
          nextData.platform = normalizedPlatform;
        }
      } else {
        if (!existingPlatform || existingPlatform === "未知") {
          nextData.platform = normalizedPlatform;
        }
      }
    }

    // 平台佣金更新逻辑
    if (Number.isFinite(Number(normalized.platformCommission))) {
      const nextVal = Math.round(Number(normalized.platformCommission));
      if (isForce) {
        if (order.platformCommission !== nextVal) {
          nextData.platformCommission = nextVal;
        }
      } else {
        if (nextData.platform && order.platformCommission == null) {
          nextData.platformCommission = nextVal;
        }
      }
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
  const result = await fetchAutoPickPluginJson<Record<string, unknown>>(userId, pathname, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return {
    ok: result.ok,
    status: result.status,
    data: result.data,
  };
}

export async function markAutoPickOrderMainSystemSelfDelivery(userId: string, orderId: string) {
  const order = await prisma.autoPickOrder.findFirst({
    where: {
      id: orderId,
      userId,
    },
    select: {
      id: true,
      rawPayload: true,
    },
  });

  if (!order) {
    return null;
  }

  const rawPayload = order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)
    ? order.rawPayload as Record<string, unknown>
    : {};
  const existingSystemMeta = readAutoPickSystemMeta(order.rawPayload) || {};

  const updatedOrder = await prisma.autoPickOrder.update({
    where: { id: order.id },
    data: {
      rawPayload: asPrismaJsonValue({
        ...rawPayload,
        systemMeta: {
          ...existingSystemMeta,
          mainSystemSelfDelivery: {
            triggered: true,
            triggeredAt: new Date().toISOString(),
            userId,
          },
        },
      }),
      lastSyncedAt: new Date(),
    },
  });

  emitAutoPickOrderEvent({
    type: "upsert",
    userId,
    orderId: updatedOrder.id,
    orderNo: updatedOrder.orderNo,
    platform: updatedOrder.platform,
    at: new Date().toISOString(),
  });

  return updatedOrder;
}

export async function clearAutoPickOrderMainSystemSelfDelivery(
  userId: string,
  orderId: string,
  reason = "manual-sync-reset"
) {
  const order = await prisma.autoPickOrder.findFirst({
    where: {
      id: orderId,
      userId,
    },
    select: {
      id: true,
      orderNo: true,
      platform: true,
      rawPayload: true,
    },
  });

  if (!order) {
    return null;
  }

  const rawPayload = order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)
    ? order.rawPayload as Record<string, unknown>
    : {};
  const existingSystemMeta = readAutoPickSystemMeta(order.rawPayload) || {};
  const currentMarker = existingSystemMeta.mainSystemSelfDelivery;
  if (!currentMarker?.triggered) {
    return null;
  }

  const updatedOrder = await prisma.autoPickOrder.update({
    where: { id: order.id },
    data: {
      rawPayload: asPrismaJsonValue({
        ...rawPayload,
        systemMeta: {
          ...existingSystemMeta,
          mainSystemSelfDelivery: {
            ...currentMarker,
            triggered: false,
            clearedAt: new Date().toISOString(),
            clearedReason: reason,
          },
        },
      }),
      autoCompleteAt: null,
      lastSyncedAt: new Date(),
    },
  });

  emitAutoPickOrderEvent({
    type: "upsert",
    userId,
    orderId: updatedOrder.id,
    orderNo: updatedOrder.orderNo,
    platform: updatedOrder.platform,
    at: new Date().toISOString(),
  });

  return updatedOrder;
}

export async function wasAutoPickOrderSelfDeliveryTriggeredByMainSystem(userId: string, platformOrderId: string) {
  const normalizedPlatformOrderId = String(platformOrderId || "").trim();
  if (!normalizedPlatformOrderId) {
    return false;
  }

  const order = await prisma.autoPickOrder.findFirst({
    where: {
      userId,
      orderNo: normalizedPlatformOrderId,
    },
    orderBy: {
      orderTime: "desc",
    },
    select: {
      rawPayload: true,
    },
  });

  const systemMeta = readAutoPickSystemMeta(order?.rawPayload);
  return Boolean(systemMeta?.mainSystemSelfDelivery?.triggered);
}

function isLikelyAutoPickSelfDelivery(order: {
  rawPayload?: unknown;
  delivery?: unknown;
}) {
  const rawPayload = order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)
    ? order.rawPayload as Record<string, unknown>
    : {};
  const delivery = order.delivery && typeof order.delivery === "object" && !Array.isArray(order.delivery)
    ? order.delivery as Record<string, unknown>
    : {};

  const statusCandidates = [
    rawPayload.status,
    rawPayload.tips,
    rawPayload.delivery_status,
    rawPayload.deliveryStatus,
    rawPayload.logisticTag,
    rawPayload.logistic_tag,
    rawPayload.logisticName,
    rawPayload.logistic_name,
    delivery.logisticName,
    delivery.logistic_name,
    delivery.track,
  ];

  return statusCandidates.some((item) => /自配|商家自配|oneself/i.test(String(item || "").trim()));
}

async function resolveBrushOrderItemsForAutoPickOrder(
  userId: string,
  order: {
    orderNo?: string | null;
    platform?: string | null;
    shopId?: string | null;
    rawPayload?: unknown;
    preferredMappedShopName?: string | null;
    items: Array<{ productName: string; productNo?: string | null; quantity: number; rawPayload?: unknown }>;
  }
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { permissions: true },
  });

  const rawPayloadRecord = order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)
    ? order.rawPayload as Record<string, unknown>
    : {};
  const lockedResolvedShop = readResolvedAutoPickShop(order.rawPayload);
  const rawShopName = readPreferredMaiyatianShopName(rawPayloadRecord) || null;
  const rawShopAddress = readPreferredMaiyatianShopAddress(rawPayloadRecord) || null;
  const preferredMappedShopName = String(order.preferredMappedShopName || "").trim() || null;
  const mappedShopName = preferredMappedShopName || lockedResolvedShop?.name || findMappedShopNameFromAutoPickConfig(
    normalizeExternalId(order.shopId) || null,
    rawShopName,
    rawShopAddress,
    user?.permissions
  );

  const shopProducts = await prisma.shopProduct.findMany({
      where: {
        shop: { userId },
      },
      select: {
        id: true,
        productId: true,
        sourceProductId: true,
        productName: true,
        sku: true,
        jdSkuId: true,
        shop: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  const userShops = mappedShopName || lockedResolvedShop?.id
    ? await prisma.shop.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
          address: true,
          externalId: true,
        },
      })
    : [];
  const internalShop = lockedResolvedShop?.id
    ? userShops.find((shop) => shop.id === lockedResolvedShop.id) || null
    : mappedShopName
    ? findMatchingShopRecord(userShops, { name: mappedShopName })
    : null;
  const mappedShopNameText = String(internalShop?.name || mappedShopName || "").trim();
  const isCandidateInMappedShop = (candidateShopId: string | null | undefined, candidateShopName: string | null | undefined) => {
    if (internalShop?.id) {
      return candidateShopId === internalShop.id;
    }
    return isShopNameMatch(candidateShopName, mappedShopNameText);
  };

  const shopProductNameMap = new Map<string, Array<{
    id: string;
    productId: string | null;
    sourceProductId: string | null;
    sku: string | null;
    jdSkuId: string | null;
    shopId: string | null;
    shopName: string | null;
  }>>();
  const shopProductSkuMap = new Map<string, Array<{
    id: string;
    productId: string | null;
    sourceProductId: string | null;
    sku: string | null;
    jdSkuId: string | null;
    shopId: string | null;
    shopName: string | null;
  }>>();
  const normalizedShopProductEntries: Array<{
    id: string;
    normalizedProductName: string;
    productId: string | null;
    sourceProductId: string | null;
    sku: string | null;
    jdSkuId: string | null;
    shopId: string | null;
    shopName: string | null;
  }> = [];
  for (const item of shopProducts) {
    const entry = {
      id: item.id,
      productId: item.productId || null,
      sourceProductId: item.sourceProductId || null,
      sku: item.sku || null,
      jdSkuId: item.jdSkuId || null,
      shopId: item.shop?.id || null,
      shopName: item.shop?.name || null,
    };
    const productName = toAutoPickBaseProductName(item.productName);
    const normalizedName = toNormalizedText(productName);
    if (normalizedName) {
      const current = shopProductNameMap.get(normalizedName) || [];
      current.push(entry);
      shopProductNameMap.set(normalizedName, current);
      normalizedShopProductEntries.push({
        normalizedProductName: normalizedName,
        ...entry,
      });
    }
    const normalizedSku = normalizeShopProductSkuForPlatformMatch(order.platform, item);
    if (normalizedSku) {
      const current = shopProductSkuMap.get(normalizedSku) || [];
      current.push(entry);
      shopProductSkuMap.set(normalizedSku, current);
    }
  }

  const resolvedItems: Array<{ productId: string; quantity: number }> = [];
  const missingItems: string[] = [];
  const resolvedCandidateShopNames = new Set<string>();

  for (const item of order.items) {
    const manualMatchedProduct = readManualMatchedProductFromOrderItemRawPayload(item.rawPayload);
    if (manualMatchedProduct?.shopProductId) {
      const productIds = manualMatchedProduct.shopProductId.split(/[+＋]/).map(id => id.trim()).filter(Boolean);
      if (productIds.length > 1) {
        let hasUnresolved = false;
        const subResolvedItems: Array<{ productId: string; quantity: number }> = [];

        for (const subShopProductId of productIds) {
          const matchedShopProduct = shopProducts.find((product) => product.id === subShopProductId);
          const resolvedProductId = String(
            matchedShopProduct?.productId
            || matchedShopProduct?.sourceProductId
            || ""
          ).trim();

          if (resolvedProductId) {
            subResolvedItems.push({
              productId: resolvedProductId,
              quantity: Math.max(1, Number(item.quantity || 1) || 1),
            });
          } else {
            hasUnresolved = true;
          }
        }

        if (!hasUnresolved && subResolvedItems.length > 0) {
          resolvedItems.push(...subResolvedItems);
          continue;
        }
      } else {
        const matchedShopProduct = shopProducts.find((product) => product.id === manualMatchedProduct.shopProductId);

        if (matchedShopProduct) {
          const resolvedProductId = String(
            matchedShopProduct.productId
            || matchedShopProduct.sourceProductId
            || ""
          ).trim();

          if (resolvedProductId) {
            resolvedItems.push({
              productId: resolvedProductId,
              quantity: Math.max(1, Number(item.quantity || 1) || 1),
            });
            continue;
          }
        }
      }

      missingItems.push(item.productName || "未命名商品");
      continue;
    }

    const productName = toAutoPickBaseProductName(item.productName);
    const normalizedSku = normalizeAutoPickSkuForMatch(item.productNo);
    const allSameSkuCandidates = normalizedSku ? (shopProductSkuMap.get(normalizedSku) || []) : [];

    const sameSkuCandidates = allSameSkuCandidates.filter((candidate) => isCandidateInMappedShop(candidate.shopId, candidate.shopName));
    const sameShopSkuCandidate = sameSkuCandidates.find((candidate) => {
      const candidateProductId = candidate.productId || candidate.sourceProductId;
      return Boolean(candidateProductId);
    });

    const resolvedProductId = String(
      sameShopSkuCandidate?.productId
      || sameShopSkuCandidate?.sourceProductId
      || ""
    ).trim();

    if (!resolvedProductId) {
      missingItems.push(`${productName}${normalizedSku ? ` / SKU ${normalizedSku}` : ""}`);
      continue;
    }

    const resolvedCandidateShopName = String(sameShopSkuCandidate?.shopName || "").trim();
    if (resolvedCandidateShopName) {
      resolvedCandidateShopNames.add(resolvedCandidateShopName);
    }

    resolvedItems.push({
      productId: resolvedProductId,
      quantity: Math.max(1, Number(item.quantity || 1) || 1),
    });
  }

  const resolvedShopNameFromCandidates = resolvedCandidateShopNames.size === 1
    ? Array.from(resolvedCandidateShopNames)[0]
    : null;

  return {
    items: resolvedItems,
    missingItems,
    mappedShopName: String(internalShop?.name || mappedShopName || resolvedShopNameFromCandidates || "").trim() || null,
  };
}

function buildAutoPickOutboundNote(order: {
  matchedShopName?: string | null;
  dailyPlatformSequence: number;
  platform: string;
  orderNo: string;
  userAddress: string;
}) {
  const prefix = order.matchedShopName
    ? `[店铺:${order.matchedShopName}] `
    : "";
  return `${prefix}[流水号:${order.dailyPlatformSequence || "无"}] [${order.platform}推单] 平台单号: ${order.orderNo} | 地址: ${order.userAddress}`;
}

type ResolvedAutoPickOutboundItem = {
  productId: string | null;
  shopProductId: string | null;
  quantity: number;
  price: number;
};

type InsufficientAutoPickStockItem = {
  productId: string | null;
  shopProductId: string | null;
  name: string;
  image: string | null;
  quantity: number;
  availableQuantity: number;
  missingQuantity: number;
  mappedShopId: string | null;
  mappedShopName: string | null;
  systemStock?: number;
};

async function resolveOutboundItemsForAutoPickOrder(
  tx: Prisma.TransactionClient,
  userId: string,
  order: {
    platform?: string | null;
    shopId?: string | null;
    rawPayload?: unknown;
    actualPaid?: number | null;
    preferredMappedShopName?: string | null;
    items: Array<{
      productName: string;
      productNo?: string | null;
      quantity: number;
      thumb?: string | null;
      rawPayload?: unknown;
    }>;
  }
) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { permissions: true },
  });

  const rawPayloadRecord = order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)
    ? order.rawPayload as Record<string, unknown>
    : {};
  const lockedResolvedShop = readResolvedAutoPickShop(order.rawPayload);
  const rawShopName = readPreferredMaiyatianShopName(rawPayloadRecord) || null;
  const rawShopAddress = readPreferredMaiyatianShopAddress(rawPayloadRecord) || null;
  const preferredMappedShopName = String(order.preferredMappedShopName || "").trim() || null;
  const resolvedInternalShop = lockedResolvedShop?.id
    ? { id: lockedResolvedShop.id, name: String(lockedResolvedShop.name || "").trim() || "" }
    : await resolveAutoPickInternalShop(tx, userId, {
        shopId: order.shopId || undefined,
        rawShopName: rawShopName || undefined,
        rawShopAddress: rawShopAddress || undefined,
      });
  const mappedShopName = preferredMappedShopName || resolvedInternalShop?.name || lockedResolvedShop?.name || findMappedShopNameFromAutoPickConfig(
    normalizeExternalId(order.shopId) || null,
    rawShopName,
    rawShopAddress,
    user?.permissions
  );
  const internalShop = resolvedInternalShop
    ? { id: resolvedInternalShop.id, name: resolvedInternalShop.name }
    : null;
  const mappedShopNameText = String(internalShop?.name || mappedShopName || "").trim();
  const isCandidateInMappedShop = (candidateShopId: string | null | undefined, candidateShopName: string | null | undefined) => {
    if (internalShop?.id) {
      return candidateShopId === internalShop.id;
    }
    return isShopNameMatch(candidateShopName, mappedShopNameText);
  };

  const shopProducts = await tx.shopProduct.findMany({
      where: {
        shop: { userId },
      },
      select: {
        id: true,
        productId: true,
        sourceProductId: true,
        productName: true,
        sku: true,
        jdSkuId: true,
        shop: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  const shopProductSkuMap = new Map<string, Array<{
    id: string;
    productId: string | null;
    sourceProductId: string | null;
    sku: string | null;
    jdSkuId: string | null;
    shopId: string | null;
    shopName: string | null;
  }>>();
  const shopProductNameMap = new Map<string, Array<{
    id: string;
    productId: string | null;
    sourceProductId: string | null;
    sku: string | null;
    jdSkuId: string | null;
    shopId: string | null;
    shopName: string | null;
  }>>();
  for (const item of shopProducts) {
    const entry = {
      id: item.id,
      productId: item.productId || null,
      sourceProductId: item.sourceProductId || null,
      sku: item.sku || null,
      jdSkuId: item.jdSkuId || null,
      shopId: item.shop?.id || null,
      shopName: item.shop?.name || null,
    };

    const normalizedName = toNormalizedText(item.productName);
    if (normalizedName) {
      const current = shopProductNameMap.get(normalizedName) || [];
      current.push(entry);
      shopProductNameMap.set(normalizedName, current);
    }

    const normalizedSku = normalizeShopProductSkuForPlatformMatch(order.platform, item);
    if (!normalizedSku) continue;
    const current = shopProductSkuMap.get(normalizedSku) || [];
    current.push(entry);
    shopProductSkuMap.set(normalizedSku, current);
  }

  const priceShare = Math.max(0, FinanceMath.divide((Number(order.actualPaid || 0) || 0) / 100, Math.max(1, order.items.length)));
  const resolvedItems: ResolvedAutoPickOutboundItem[] = [];

  for (const item of order.items) {
    const manualMatchedProduct = readManualMatchedProductFromOrderItemRawPayload(item.rawPayload);
    const productName = toAutoPickBaseProductName(item.productName);
    const normalizedSkus = splitCompositeAutoPickSku(item.productNo);
    const skuParts = normalizedSkus.length > 0 ? normalizedSkus : [normalizeAutoPickSkuForMatch(item.productNo)];
    const perResolvedPrice = FinanceMath.divide(priceShare, Math.max(1, skuParts.filter(Boolean).length || 1));

    for (const normalizedSku of skuParts) {
      if (manualMatchedProduct?.id) {
        if ((manualMatchedProduct as any).bundleItems && Array.isArray((manualMatchedProduct as any).bundleItems)) {
          const bundleItems = (manualMatchedProduct as any).bundleItems;
          for (const bundleItem of bundleItems) {
            const matchedShopProduct = await tx.shopProduct.findFirst({
              where: {
                id: bundleItem.shopProductId || bundleItem.id,
                shop: { userId },
              },
              select: {
                id: true,
                productId: true,
                sourceProductId: true,
              },
            });

            const resolvedSubProductId = String(
              matchedShopProduct?.productId
              || matchedShopProduct?.sourceProductId
              || bundleItem.id
              || ""
            ).trim() || null;

            resolvedItems.push({
              productId: resolvedSubProductId,
              shopProductId: bundleItem.shopProductId || bundleItem.id,
              quantity: Math.max(1, Number(item.quantity || 1) || 1),
              price: FinanceMath.divide(perResolvedPrice, bundleItems.length),
            });
          }
          continue;
        }

        const storedManualShopProductId = String(manualMatchedProduct.shopProductId || "").trim() || null;
        let manualShopProductId: string | null = storedManualShopProductId;
        let manualResolvedProductId: string | null =
          manualMatchedProduct.sourceType === "shopProduct" ? null : manualMatchedProduct.id;

        const matchedShopProduct = await tx.shopProduct.findFirst({
          where: {
            shop: { userId },
            ...(internalShop?.id ? { shopId: internalShop.id } : {}),
            OR: [
              ...(storedManualShopProductId ? [{ id: storedManualShopProductId }] : []),
              { id: manualMatchedProduct.id },
              { productId: manualMatchedProduct.id },
              { sourceProductId: manualMatchedProduct.id },
            ],
          },
          select: {
            id: true,
            productId: true,
            sourceProductId: true,
          },
          orderBy: { updatedAt: "desc" },
        });

        if (matchedShopProduct) {
          manualShopProductId = matchedShopProduct.id;
          manualResolvedProductId = String(
            matchedShopProduct.productId
            || matchedShopProduct.sourceProductId
            || manualResolvedProductId
            || ""
          ).trim() || null;
        }

        resolvedItems.push({
          productId: manualResolvedProductId,
          shopProductId: manualShopProductId,
          quantity: Math.max(1, Number(item.quantity || 1) || 1),
          price: perResolvedPrice,
        });
        continue;
      }

      let resolvedShopProduct: {
        id: string;
        productId: string | null;
        sourceProductId: string | null;
        sku: string | null;
        jdSkuId: string | null;
        shopId: string | null;
        shopName: string | null;
      } | null = null;

      if (normalizedSku) {
        const skuCandidates = (shopProductSkuMap.get(normalizedSku) || []).filter((candidate) =>
          isCandidateInMappedShop(candidate.shopId, candidate.shopName)
        );
        const uniqueCandidateShopIds = Array.from(
          new Set(
            skuCandidates
              .map((candidate) => String(candidate.shopId || "").trim())
              .filter(Boolean)
          )
        );

        if (!internalShop?.id && uniqueCandidateShopIds.length > 1) {
          throw new Error(
            `店铺商品匹配冲突：SKU ${normalizedSku} 命中多个店铺，且当前订单未能唯一识别店铺`
          );
        }

        const sameShopSkuCandidate = skuCandidates[0] || null;
        if (sameShopSkuCandidate) {
          resolvedShopProduct = sameShopSkuCandidate;
        }
      }

      if (!resolvedShopProduct && internalShop?.id && normalizedSku) {
        const existingShopProduct = await findExistingShopProductByShopAndSku(tx, internalShop.id, normalizedSku, order.platform);
        if (existingShopProduct) {
          resolvedShopProduct = {
            id: existingShopProduct.id,
            productId: existingShopProduct.productId || null,
            sourceProductId: existingShopProduct.sourceProductId || null,
            sku: existingShopProduct.sku || null,
            jdSkuId: existingShopProduct.jdSkuId || null,
            shopId: internalShop.id,
            shopName: internalShop.name,
          };
        }
      }

      if (!resolvedShopProduct) {
        throw new Error(
          `店铺商品匹配失败：${internalShop?.name || mappedShopName || "未识别店铺"} / 商品 ${productName || "未命名商品"} / SKU ${normalizedSku || "未提供"}`
        );
      }

      resolvedItems.push({
        productId: String(
          resolvedShopProduct?.productId
          || resolvedShopProduct?.sourceProductId
          || ""
        ).trim() || null,
        shopProductId: resolvedShopProduct?.id || null,
        quantity: Math.max(1, Number(item.quantity || 1) || 1),
        price: perResolvedPrice,
      });
    }
  }

  const resolvedShopName = resolvedItems.length > 0
    ? (
        shopProducts.find((candidate) => candidate.id === resolvedItems.find((item) => item.shopProductId)?.shopProductId)?.shop?.name
        || internalShop?.name
        || mappedShopName
        || null
      )
    : (internalShop?.name || mappedShopName || null);
  const resolvedShopId = resolvedItems.length > 0
    ? (
        shopProducts.find((candidate) => candidate.id === resolvedItems.find((item) => item.shopProductId)?.shopProductId)?.shop?.id
        || internalShop?.id
        || null
      )
    : (internalShop?.id || null);

  return {
    items: resolvedItems,
    mappedShopId: resolvedShopId,
    mappedShopName: resolvedShopName,
    displayShopName: resolvedShopName,
  };
}



export async function createOutboundFromAutoPickOrder(
  userId: string,
  orderId: string,
  options?: { requireCompleted?: boolean; preferredMappedShopName?: string | null }
) {
  const requireCompleted = options?.requireCompleted === true;
  const storage = await getStorageStrategy();

  const order = await prisma.autoPickOrder.findFirst({
    where: {
      id: orderId,
      userId,
    },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!order) {
    return { ok: false, skipped: true, reason: "order-not-found" as const };
  }

  if (isAutoPickOrderDeletedStatus(order.status)) {
    return { ok: false, skipped: true, reason: "order-deleted" as const };
  }

  if (isAutoPickOrderCancelledStatus(order.status)) {
    return { ok: false, skipped: true, reason: "order-cancelled" as const };
  }

  if (requireCompleted && !isAutoPickOrderCompletedStatus(order.status)) {
    return { ok: false, skipped: true, reason: "order-not-completed" as const };
  }

  if (isAutoPickOtherPickupOrder(order.rawPayload)) {
    return { ok: false, skipped: true, reason: "other-pickup-no-outbound" as const };
  }

  const existingOutbound = await prisma.outboundOrder.findFirst({
    where: {
      userId,
      note: {
        contains: `平台单号: ${order.orderNo}`,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (existingOutbound) {
    return { ok: true, duplicated: true, outboundOrderId: existingOutbound.id };
  }

  if (order.items.length === 0) {
    return { ok: false, skipped: true, reason: "no-items" as const };
  }

  const created = await prisma.$transaction(async (tx) => {
    const resolved = await resolveOutboundItemsForAutoPickOrder(tx, userId, {
      platform: order.platform,
      shopId: order.shopId,
      rawPayload: order.rawPayload,
      actualPaid: order.actualPaid,
      preferredMappedShopName: options?.preferredMappedShopName || null,
      items: order.items.map((item) => ({
        productName: item.productName,
        productNo: item.productNo,
        quantity: item.quantity,
        thumb: item.thumb,
        rawPayload: item.rawPayload,
      })),
    });

    const insufficientItems: InsufficientAutoPickStockItem[] = [];
    for (const item of resolved.items) {
      if (item.shopProductId) {
        const [aggregateResult, shopProduct] = await Promise.all([
          tx.purchaseOrderItem.aggregate({
            where: {
              shopProductId: item.shopProductId,
              remainingQuantity: { gt: 0 },
              purchaseOrder: {
                userId,
                status: "Received",
              },
            },
            _sum: { remainingQuantity: true },
          }),
          tx.shopProduct.findUnique({
            where: { id: item.shopProductId },
            select: {
              productName: true,
              stock: true,
              productImage: true,
              product: { select: { image: true } },
              shop: { select: { id: true, name: true } },
            },
          }),
        ]);
        const currentBatchStock = aggregateResult._sum.remainingQuantity || 0;
        const currentSystemStock = shopProduct?.stock || 0;
        if (currentBatchStock < item.quantity) {
          insufficientItems.push({
            productId: item.productId,
            shopProductId: item.shopProductId,
            name: String(shopProduct?.productName || "未命名商品").trim() || "未命名商品",
            image: shopProduct?.productImage
              ? storage.resolveUrl(shopProduct.productImage)
              : shopProduct?.product?.image
                ? storage.resolveUrl(shopProduct.product.image)
                : null,
            quantity: item.quantity,
            availableQuantity: currentBatchStock,
            missingQuantity: item.quantity - currentBatchStock,
            mappedShopId: shopProduct?.shop?.id || resolved.mappedShopId || null,
            mappedShopName: shopProduct?.shop?.name || resolved.mappedShopName || null,
            systemStock: currentSystemStock,
          });
        }
      } else if (item.productId) {
        const [aggregateResult, product] = await Promise.all([
          tx.purchaseOrderItem.aggregate({
            where: {
              productId: item.productId,
              remainingQuantity: { gt: 0 },
              purchaseOrder: {
                userId,
                status: "Received",
              },
            },
            _sum: { remainingQuantity: true },
          }),
          tx.product.findUnique({
            where: { id: item.productId },
            select: { name: true, stock: true, image: true },
          }),
        ]);
        const currentBatchStock = aggregateResult._sum.remainingQuantity || 0;
        const currentSystemStock = product?.stock || 0;
        if (currentBatchStock < item.quantity) {
          insufficientItems.push({
            productId: item.productId,
            shopProductId: null,
            name: String(product?.name || "未命名商品").trim() || "未命名商品",
            image: product?.image ? storage.resolveUrl(product.image) : null,
            quantity: item.quantity,
            availableQuantity: currentBatchStock,
            missingQuantity: item.quantity - currentBatchStock,
            mappedShopId: resolved.mappedShopId || null,
            mappedShopName: resolved.mappedShopName || null,
            systemStock: currentSystemStock,
          });
        }
      }
    }

    if (insufficientItems.length > 0) {
      return {
        kind: "insufficient" as const,
        insufficientItems,
      };
    }

    const costSnapshots = await InventoryService.processOutboundFIFO(
      tx,
      userId,
      resolved.items.map((item) => ({
        productId: item.productId,
        shopProductId: item.shopProductId,
        quantity: item.quantity,
      }))
    );

    const outboundOrder = await tx.outboundOrder.create({
      data: {
        type: "Sale",
        status: "Normal",
        date: parseAsShanghaiTime(order.orderTime),
        note: buildAutoPickOutboundNote({
          matchedShopName: resolved.displayShopName,
          dailyPlatformSequence: order.dailyPlatformSequence,
          platform: order.platform,
          orderNo: order.orderNo,
          userAddress: order.userAddress,
        }),
        userId,
        items: {
          create: resolved.items.map((item) => {
            const costSnapshot = costSnapshots.shift();
            return {
              productId: item.productId,
              shopProductId: item.shopProductId,
              quantity: item.quantity,
              price: item.price,
              costSnapshot: (costSnapshot || Prisma.JsonNull) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
            };
          }),
        },
      },
      select: {
        id: true,
      },
    });

    return {
      kind: "created" as const,
      outboundOrder,
    };
  });
  if (created.kind === "insufficient") {
    return {
      ok: false,
      skipped: true,
      reason: "insufficient-stock" as const,
      insufficientItems: created.insufficientItems,
    };
  }

  return {
    ok: true,
    outboundOrderId: created.outboundOrder.id,
  };
}

async function updateAutoPickOrderAutoOutboundState(
  userId: string,
  orderId: string,
  nextState: NonNullable<AutoPickSystemMeta["autoOutbound"]>
) {
  const order = await prisma.autoPickOrder.findFirst({
    where: {
      id: orderId,
      userId,
    },
    select: {
      id: true,
      rawPayload: true,
    },
  });

  if (!order) {
    return null;
  }

  const rawPayload = order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)
    ? order.rawPayload as Record<string, unknown>
    : {};
  const existingSystemMeta = readAutoPickSystemMeta(order.rawPayload) || {};

  return await prisma.autoPickOrder.update({
    where: { id: order.id },
    data: {
      rawPayload: asPrismaJsonValue({
        ...rawPayload,
        systemMeta: {
          ...existingSystemMeta,
          autoOutbound: nextState,
        },
      }),
      lastSyncedAt: new Date(),
    },
  });
}

export async function syncAutoOutboundFromCompletedAutoPickOrder(userId: string, orderId: string) {
  const attemptedAt = new Date().toISOString();
  const order = await prisma.autoPickOrder.findFirst({
    where: {
      id: orderId,
      userId,
    },
    select: {
      rawPayload: true,
    },
  });

  if (!order) {
    return { ok: false, skipped: true, reason: "order-not-found" as const };
  }

  const systemMeta = readAutoPickSystemMeta(order.rawPayload);
  if (systemMeta?.mainSystemSelfDelivery?.triggered) {
    return { ok: false, skipped: true, reason: "brush-order-no-auto-outbound" as const };
  }

  if (isAutoPickOtherPickupOrder(order.rawPayload)) {
    return { ok: false, skipped: true, reason: "other-pickup-no-outbound" as const };
  }

  try {
    const result = await createOutboundFromAutoPickOrder(userId, orderId, { requireCompleted: true });

    if (result.ok) {
      await updateAutoPickOrderAutoOutboundState(userId, orderId, {
        status: "success",
        attemptedAt,
        resolvedAt: new Date().toISOString(),
        error: undefined,
        outboundOrderId: result.outboundOrderId,
      });
      return result;
    }

    if (result.reason === "no-items") {
      await updateAutoPickOrderAutoOutboundState(userId, orderId, {
        status: "failed",
        attemptedAt,
        error: "订单没有可生成出库的商品",
      });
    }
    if (result.reason === "insufficient-stock") {
      const summary = Array.isArray(result.insufficientItems)
        ? result.insufficientItems
            .map((item) => `${item.name} 缺 ${item.missingQuantity} 件`)
            .join("；")
        : "";
      await updateAutoPickOrderAutoOutboundState(userId, orderId, {
        status: "failed",
        attemptedAt,
        error: summary ? `库存不足，请先创建采购单：${summary}` : "库存不足，请先创建采购单",
      });
    }

    return result;
  } catch (error) {
    const message = getOutboundOrderItemSchemaErrorMessage(error)
      || (error instanceof Error ? error.message : "自动出库失败");
    await updateAutoPickOrderAutoOutboundState(userId, orderId, {
      status: "failed",
      attemptedAt,
      error: message.slice(0, 1000),
    }).catch(() => null);
    throw new Error(message);
  }
}

export async function syncBrushOrderFromCompletedAutoPickOrder(
  userId: string,
  orderId: string,
  options?: {
    allowSelfDeliveryFallback?: boolean;
    fallbackOnly?: boolean;
    forceInclude?: boolean;
    preferredMappedShopName?: string | null;
    overwriteExisting?: boolean;
    commission?: number;
  }
) {
  const order = await prisma.autoPickOrder.findFirst({
    where: {
      id: orderId,
      userId,
    },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!order) {
    return { ok: false, skipped: true, reason: "order-not-found" as const };
  }

  const systemMeta = readAutoPickSystemMeta(order.rawPayload);
  const triggeredByMainSystem = Boolean(systemMeta?.mainSystemSelfDelivery?.triggered);
  if (triggeredByMainSystem && options?.fallbackOnly === true) {
    return { ok: false, skipped: true, reason: "managed-by-auto-brush" as const };
  }
  const fallbackMatched = !triggeredByMainSystem
    && options?.allowSelfDeliveryFallback === true
    && isLikelyAutoPickSelfDelivery({
      rawPayload: order.rawPayload,
      delivery: order.delivery,
    });

  if (!triggeredByMainSystem && !fallbackMatched && options?.forceInclude !== true) {
    return {
      ok: false,
      skipped: true,
      reason: options?.allowSelfDeliveryFallback ? "not-self-delivery" as const : "not-main-system-self-delivery" as const,
    };
  }

  if (!isAutoPickOrderCompletedStatus(order.status)) {
    return { ok: false, skipped: true, reason: "order-not-completed" as const };
  }

  const existing = await prisma.brushOrder.findFirst({
    where: {
      userId,
      platformOrderId: order.orderNo,
    },
    select: {
      id: true,
    },
  });

  const resolved = await resolveBrushOrderItemsForAutoPickOrder(userId, {
    orderNo: order.orderNo,
    platform: order.platform,
    shopId: order.shopId,
    rawPayload: order.rawPayload,
    preferredMappedShopName: options?.preferredMappedShopName || null,
    items: order.items.map((item) => ({
      productName: item.productName,
      productNo: item.productNo,
      quantity: item.quantity,
      rawPayload: item.rawPayload,
    })),
  });

  if (resolved.items.length === 0 || resolved.missingItems.length > 0) {
    return {
      ok: false,
      skipped: true,
      reason: "missing-matched-products" as const,
      missingItems: resolved.missingItems,
    };
  }

  const paymentAmount = FinanceMath.add(Number(order.actualPaid || 0) / 100, 0);
  
  let receivedBase: number;
  if (String(order.platform || "").includes("京东")) {
    const settledBase = Math.max(0, Math.round(Number(order.actualPaid || 0) - 100));
    const platformCommission = Math.max(0, Math.round(settledBase * 0.06));
    receivedBase = Math.max(0, settledBase - platformCommission);
  } else {
    receivedBase = Number.isFinite(Number(order.expectedIncome))
      ? Number(order.expectedIncome || 0)
      : Number(order.actualPaid || 0);
  }
  
  const receivedAmount = FinanceMath.add(receivedBase / 100, 0);
  const brushImportNote = options?.forceInclude === true ? "人工纳入刷单" : "推送导入";
  let commission = 0;
  if (options?.commission !== undefined) {
    commission = options.commission;
  } else {
    const integrationConfig = await getAutoPickIntegrationConfigByUserId(userId);
    commission = integrationConfig.defaultBrushCommission ?? 0;
  }

  if (existing && options?.overwriteExisting === true) {
    const brushOrder = await prisma.$transaction(async (tx) => {
      await tx.brushOrderItem.deleteMany({
        where: {
          brushOrderId: existing.id,
        },
      });

      return await tx.brushOrder.update({
        where: {
          id: existing.id,
        },
        data: {
          date: order.orderTime,
          type: order.platform,
          status: "Completed",
          paymentAmount,
          receivedAmount,
          commission,
          note: brushImportNote,
          shopName: resolved.mappedShopName,
          items: {
            create: resolved.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
          },
        },
        select: {
          id: true,
        },
      });
    });

    return {
      ok: true,
      updated: true,
      brushOrderId: brushOrder.id,
    };
  }

  if (existing) {
    return {
      ok: true,
      duplicated: true,
      brushOrderId: existing.id,
    };
  }

  const brushOrder = await prisma.brushOrder.create({
    data: {
      date: order.orderTime,
      type: order.platform,
      status: "Completed",
      userId,
      paymentAmount,
      receivedAmount,
      commission,
      note: brushImportNote,
      shopName: resolved.mappedShopName,
      platformOrderId: order.orderNo,
      items: {
        create: resolved.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
      },
    },
    select: {
      id: true,
    },
  });

  return {
    ok: true,
    brushOrderId: brushOrder.id,
  };
}

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

export function resolveAutoPickMatchedShopName(
  order: { shopId?: string | null; rawPayload?: unknown },
  permissions: unknown
) {
  const resolved = readResolvedAutoPickShop(order.rawPayload);
  const resolvedName = String(resolved?.name || "").trim();
  if (resolvedName) {
    return resolvedName;
  }
  const rawShopName = readShopNameFromRawPayload(order.rawPayload);
  const rawShopAddress = readShopAddressFromRawPayload(order.rawPayload);
  const mappedName = findMappedShopNameFromAutoPickConfig(
    order.shopId || readShopIdFromRawPayload(order.rawPayload),
    rawShopName,
    rawShopAddress,
    permissions
  );
  return String(mappedName || rawShopName || "").trim() || null;
}

export async function fixHistoryShopOrdersForUser(userId: string): Promise<number> {
  const [user, systemShops] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { permissions: true },
    }),
    prisma.shop.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        address: true,
        externalId: true,
      },
    })
  ]);

  if (!user) {
    return 0;
  }

  const orders = await prisma.autoPickOrder.findMany({
    where: { userId },
    select: {
      id: true,
      shopId: true,
      rawPayload: true,
      platform: true,
    }
  });

  let updatedCount = 0;
  const updates = [];

  for (const order of orders) {
    const rawPayload = order.rawPayload as { systemMeta?: { resolvedShop?: { id?: string; name?: string } } } | null;
    const rawPayloadRecord = order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)
      ? order.rawPayload as Record<string, unknown>
      : {};
    const lockedResolvedShop = readResolvedAutoPickShop(order.rawPayload);
    const rawShopId = order.shopId || readShopIdFromRawPayload(order.rawPayload);
    const rawShopName = readPreferredMaiyatianShopName(rawPayloadRecord)
      || readShopNameFromRawPayload(order.rawPayload)
      || lockedResolvedShop?.name
      || null;
    const rawShopAddress = readPreferredMaiyatianShopAddress(rawPayloadRecord)
      || readShopAddressFromRawPayload(order.rawPayload)
      || null;

    let targetShop = lockedResolvedShop?.id
      ? systemShops.find((shop) => shop.id === lockedResolvedShop.id) || null
      : null;

    if (!targetShop && lockedResolvedShop?.name) {
      targetShop = findMatchingShopRecord(systemShops, {
        name: lockedResolvedShop.name,
        address: normalizeShopAddress(rawShopAddress),
      });
    }

    if (!targetShop) {
      const mappedShopName = findMappedShopNameFromAutoPickConfig(
        normalizeExternalId(rawShopId) || null,
        String(rawShopName || "").trim() || null,
        String(rawShopAddress || "").trim() || null,
        user.permissions
      );

      if (mappedShopName) {
        targetShop = findMatchingShopRecord(systemShops, {
          name: mappedShopName,
        });
      }
    }

    if (!targetShop) {
      targetShop = findMatchingShopRecord(systemShops, {
        externalId: rawShopId,
        name: rawShopName,
        address: normalizeShopAddress(rawShopAddress),
      });
    }

    if (!targetShop) {
      const rawAddressKey = normalizeShopAddressKey(rawShopAddress);
      if (rawAddressKey) {
        const partialAddressMatchedShops = systemShops.filter((shop) => {
          const currentAddressKey = normalizeShopAddressKey(shop.address);
          if (!currentAddressKey) {
            return false;
          }
          return currentAddressKey.includes(rawAddressKey) || rawAddressKey.includes(currentAddressKey);
        });

        if (partialAddressMatchedShops.length === 1) {
          targetShop = partialAddressMatchedShops[0];
        }
      }
    }

    if (targetShop) {
      const currentResolvedShop = rawPayload?.systemMeta?.resolvedShop;
      const needUpdate = !order.shopId 
        || order.shopId !== targetShop.id 
        || !currentResolvedShop 
        || currentResolvedShop.id !== targetShop.id;

      if (needUpdate) {
        const nextSystemMeta = {
          ...(rawPayload?.systemMeta || {}),
          resolvedShop: {
            id: targetShop.id,
            name: targetShop.name,
          }
        };
        const nextRawPayload = {
          ...(order.rawPayload as Record<string, unknown> || {}),
          systemMeta: nextSystemMeta
        };

        updates.push(
          prisma.autoPickOrder.update({
            where: { id: order.id },
            data: {
              shopId: targetShop.id,
              rawPayload: nextRawPayload as Prisma.InputJsonValue
            }
          })
        );
        updatedCount++;
      }
    }
  }

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }

  return updatedCount;
}


