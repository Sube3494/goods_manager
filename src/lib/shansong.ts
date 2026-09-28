import crypto from "node:crypto";
import prisma from "@/lib/prisma";
import { normalizeAutoPickOrderPayload, resolveAutoPickMatchedShopName } from "@/lib/autoPickOrders";
import { Prisma } from "../../prisma/generated-client";

const CONFIG_KEY = "shansongIntegration";
const CIPHER_PREFIX = "enc:v1:";
const ACCESS_TOKEN_LEEWAY_MS = 5 * 60 * 1000;

type JsonRecord = Record<string, unknown>;

type StoredShansongConfig = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string | null;
  shopId: string | null;
  isAllStoreAuth: boolean;
  authorizedAt: string | null;
  boundShopId: string | null;
};

export type ShansongConnectionStatus = {
  appConfigured: boolean;
  authorized: boolean;
  shopId: string | null;
  expiresAt: string | null;
  authorizedAt: string | null;
  boundShopId: string | null;
  boundShopName: string | null;
};

export type ShansongQuoteOption = {
  provider: "shansong";
  logisticId: string;
  logisticTag: "shansong-official";
  name: "闪送（个人账号）";
  servicePkg: "direct";
  amount: number;
  distance?: number;
  estimatedDeliveryTime?: number;
};

export function hasActiveShansongDelivery(rawPayload: unknown) {
  const root = asRecord(rawPayload);
  const systemMeta = asRecord(root.systemMeta);
  const delivery = asRecord(systemMeta.shansongDelivery);
  const callback = asRecord(delivery.callback);
  const status = Number(callback.status ?? delivery.status ?? 0);
  return status === 20 || status === 30 || status === 40;
}

type ShansongOrder = {
  id: string;
  userId: string;
  sourceId: string;
  shopId: string | null;
  platform: string;
  orderNo: string;
  orderTime: Date;
  userAddress: string;
  shopAddress: string | null;
  longitude: number | null;
  latitude: number | null;
  customerRemark: string | null;
  rawPayload: unknown;
  items: Array<{ productName: string; quantity: number; rawPayload: unknown }>;
};

type ShansongApiResponse<T> = {
  status: number;
  msg?: string | null;
  data?: T | null;
};

type ShansongTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

type ShansongCalculateResponse = {
  totalDistance?: number;
  totalWeight?: number;
  orderNumber?: string;
  totalAmount?: number;
  totalFeeAfterSave?: number;
  estimateReceiveSecond?: number;
  feeInfoList?: unknown[];
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function getAppConfig() {
  const clientId = String(process.env.SHANSONG_APP_KEY || process.env.SHANSONG_CLIENT_ID || "").trim();
  const appSecret = String(process.env.SHANSONG_APP_SECRET || "").trim();
  const baseUrl = String(process.env.SHANSONG_API_BASE_URL || "https://open.ishansong.com").trim().replace(/\/$/, "");
  return { clientId, appSecret, baseUrl, configured: Boolean(clientId && appSecret) };
}

function cipherKey() {
  const secret = String(process.env.SHANSONG_TOKEN_ENCRYPTION_SECRET || process.env.JWT_SECRET || process.env.AUTH_SECRET || "").trim();
  if (!secret) throw new Error("缺少 JWT_SECRET，无法安全保存闪送授权信息");
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptSecret(value: string) {
  if (!value) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", cipherKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${CIPHER_PREFIX}${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptSecret(value: unknown) {
  const text = String(value || "").trim();
  if (!text || !text.startsWith(CIPHER_PREFIX)) return text;
  const [ivText, tagText, dataText] = text.slice(CIPHER_PREFIX.length).split(".");
  if (!ivText || !tagText || !dataText) return "";
  const decipher = crypto.createDecipheriv("aes-256-gcm", cipherKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataText, "base64url")), decipher.final()]).toString("utf8");
}

function normalizeStoredConfig(value: unknown): StoredShansongConfig {
  const record = asRecord(value);
  return {
    accessToken: decryptSecret(record.accessToken),
    refreshToken: decryptSecret(record.refreshToken),
    expiresAt: String(record.expiresAt || "").trim() || null,
    shopId: String(record.shopId || "").trim() || null,
    isAllStoreAuth: record.isAllStoreAuth === true,
    authorizedAt: String(record.authorizedAt || "").trim() || null,
    boundShopId: String(record.boundShopId || "").trim() || null,
  };
}

async function readUserPermissions(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { permissions: true },
  });
  if (!user) throw new Error("用户不存在");
  return asRecord(user.permissions);
}

async function getStoredConfig(userId: string) {
  const permissions = await readUserPermissions(userId);
  return normalizeStoredConfig(permissions[CONFIG_KEY]);
}

async function saveStoredConfig(userId: string, config: StoredShansongConfig) {
  const permissions = await readUserPermissions(userId);
  const stored = {
    accessToken: encryptSecret(config.accessToken),
    refreshToken: encryptSecret(config.refreshToken),
    expiresAt: config.expiresAt,
    shopId: config.shopId,
    isAllStoreAuth: config.isAllStoreAuth,
    authorizedAt: config.authorizedAt,
    boundShopId: config.boundShopId,
  };
  await prisma.user.update({
    where: { id: userId },
    data: { permissions: { ...permissions, [CONFIG_KEY]: stored } as Prisma.InputJsonValue },
  });
}

export function getShansongRedirectUri(origin: string) {
  return String(process.env.SHANSONG_REDIRECT_URI || `${origin.replace(/\/$/, "")}/api/integrations/shansong/callback`).trim();
}

export function buildShansongAuthorizationUrl(input: { state: string; redirectUri: string }) {
  const { clientId, configured } = getAppConfig();
  if (!configured) throw new Error("服务端尚未配置闪送 appKey/appSecret");
  const url = new URL("https://open.ishansong.com/auth");
  url.searchParams.set("isAllStoreAuth", "true");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "shop_open_api");
  url.searchParams.set("state", input.state);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  return url.toString();
}

export async function getShansongConnectionStatus(userId: string): Promise<ShansongConnectionStatus> {
  const app = getAppConfig();
  const stored = await getStoredConfig(userId);
  const boundShop = stored.boundShopId
    ? await prisma.shop.findFirst({ where: { id: stored.boundShopId, userId }, select: { id: true, name: true } })
    : null;
  return {
    appConfigured: app.configured,
    authorized: Boolean(stored.accessToken && stored.refreshToken),
    shopId: stored.shopId,
    expiresAt: stored.expiresAt,
    authorizedAt: stored.authorizedAt,
    boundShopId: boundShop?.id || null,
    boundShopName: boundShop?.name || null,
  };
}

export async function bindShansongShop(userId: string, shopId: string) {
  const normalizedShopId = String(shopId || "").trim();
  if (!normalizedShopId) throw new Error("请选择闪送账号对应的门店");
  const shop = await prisma.shop.findFirst({
    where: { id: normalizedShopId, userId },
    select: { id: true, name: true },
  });
  if (!shop) throw new Error("所选门店不存在或不属于当前账号");
  const stored = await getStoredConfig(userId);
  await saveStoredConfig(userId, { ...stored, boundShopId: shop.id });
  return shop;
}

async function postForm<T>(url: string, form: Record<string, string>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams(form),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => null) as ShansongApiResponse<T> | null;
  if (!response.ok || !payload || payload.status !== 200) {
    throw new Error(payload?.msg || `闪送接口请求失败（HTTP ${response.status}）`);
  }
  return payload.data as T;
}

export async function exchangeShansongAuthorizationCode(userId: string, input: {
  code: string;
  shopId?: string | null;
  isAllStoreAuth?: boolean;
}) {
  const app = getAppConfig();
  if (!app.configured) throw new Error("服务端尚未配置闪送 appKey/appSecret");
  const token = await postForm<ShansongTokenResponse>(`${app.baseUrl}/openapi/oauth/token`, {
    clientId: app.clientId,
    code: input.code,
  });
  const accessToken = String(token?.access_token || "").trim();
  const refreshToken = String(token?.refresh_token || "").trim();
  if (!accessToken || !refreshToken) throw new Error("闪送未返回完整授权令牌");
  const expiresIn = Math.max(0, Number(token.expires_in || 0));
  await saveStoredConfig(userId, {
    accessToken,
    refreshToken,
    expiresAt: expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    shopId: String(input.shopId || "").trim() || null,
    isAllStoreAuth: input.isAllStoreAuth === true,
    authorizedAt: new Date().toISOString(),
    boundShopId: (await getStoredConfig(userId)).boundShopId,
  });
}

function signParams(appSecret: string, params: Record<string, string>) {
  const source = Object.keys(params)
    .filter((key) => key !== "sign" && params[key] !== "")
    .sort((a, b) => a.localeCompare(b))
    .reduce((text, key) => `${text}${key}${params[key]}`, appSecret);
  return crypto.createHash("md5").update(source, "utf8").digest("hex").toUpperCase();
}

async function refreshAccessToken(userId: string, stored: StoredShansongConfig) {
  const app = getAppConfig();
  if (!app.configured) throw new Error("服务端尚未配置闪送 appKey/appSecret");
  if (!stored.refreshToken) throw new Error("闪送账号尚未授权");
  const data = JSON.stringify({ refreshToken: stored.refreshToken });
  const timestamp = String(Date.now());
  const baseParams = { clientId: app.clientId, timestamp, data };
  const token = await postForm<ShansongTokenResponse>(`${app.baseUrl}/openapi/oauth/refresh_token`, {
    ...baseParams,
    sign: signParams(app.appSecret, baseParams),
  });
  const accessToken = String(token?.access_token || "").trim();
  if (!accessToken) throw new Error("刷新闪送授权失败：未返回 access_token");
  const expiresIn = Math.max(0, Number(token.expires_in || 0));
  const next = {
    ...stored,
    accessToken,
    expiresAt: expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
  };
  await saveStoredConfig(userId, next);
  return next;
}

async function getUsableAccessToken(userId: string) {
  let stored = await getStoredConfig(userId);
  if (!stored.accessToken) throw new Error("请先授权闪送个人商户账号");
  const expiresAt = stored.expiresAt ? new Date(stored.expiresAt).getTime() : 0;
  if (stored.refreshToken && (!expiresAt || expiresAt <= Date.now() + ACCESS_TOKEN_LEEWAY_MS)) {
    stored = await refreshAccessToken(userId, stored);
  }
  return stored.accessToken;
}

async function callShansongApi<T>(userId: string, pathname: string, data?: unknown) {
  const app = getAppConfig();
  if (!app.configured) throw new Error("服务端尚未配置闪送 appKey/appSecret");
  const accessToken = await getUsableAccessToken(userId);
  const timestamp = String(Date.now());
  const dataText = data === undefined ? "" : JSON.stringify(data);
  const baseParams = {
    accessToken,
    clientId: app.clientId,
    data: dataText,
    timestamp,
  };
  return postForm<T>(`${app.baseUrl}${pathname}`, {
    ...baseParams,
    sign: signParams(app.appSecret, baseParams),
  });
}

function readFirstText(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = String(record[key] || "").trim();
    if (value) return value;
  }
  return "";
}

function walkRecords(root: JsonRecord) {
  const records = [root];
  for (const key of ["user_info", "userInfo", "receiver", "receiver_info", "receiverInfo", "recipient", "recipientInfo", "address_info", "addressInfo"]) {
    const child = asRecord(root[key]);
    if (Object.keys(child).length) records.push(child);
  }
  return records;
}

function readGcjCoordinate(rawPayload: unknown, axis: "longitude" | "latitude") {
  const keys = axis === "longitude"
    ? ["gcj02_longitude", "gcj02Longitude", "gcj02_lng", "gcj02Lng"]
    : ["gcj02_latitude", "gcj02Latitude", "gcj02_lat", "gcj02Lat"];
  for (const record of walkRecords(asRecord(rawPayload))) {
    for (const key of keys) {
      const value = Number(record[key]);
      if (Number.isFinite(value) && value !== 0) return value;
    }
  }
  return 0;
}

function bd09ToGcj02(lng: number, lat: number) {
  const x = lng - 0.0065;
  const y = lat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * Math.PI * 3000 / 180);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * Math.PI * 3000 / 180);
  return { lng: z * Math.cos(theta), lat: z * Math.sin(theta) };
}

function inferGoodType(items: ShansongOrder["items"]) {
  const text = items.map((item) => item.productName).join(" ");
  if (/鲜花|花束|玫瑰|百合|康乃馨/.test(text)) return 7;
  if (/蛋糕/.test(text)) return 5;
  if (/餐|饭|面|粉|粥|饮品|奶茶/.test(text)) return 6;
  if (/水果|果篮/.test(text)) return 16;
  if (/药|医用|医疗/.test(text)) return 13;
  if (/手机|电脑|数码|耳机/.test(text)) return 3;
  return 10;
}

function truncate(value: string, max: number) {
  return Array.from(value).slice(0, max).join("");
}

async function buildCalculatePayload(order: ShansongOrder) {
  const user = await prisma.user.findUnique({
    where: { id: order.userId },
    select: { permissions: true, shippingAddresses: true },
  });
  if (!user) throw new Error("订单所属用户不存在");
  const permissions = asRecord(user.permissions);
  const matchedShopName = resolveAutoPickMatchedShopName(order, permissions);
  const shansongConfig = normalizeStoredConfig(permissions[CONFIG_KEY]);
  if (!shansongConfig.boundShopId) throw new Error("请先在个人中心为闪送账号绑定门店");
  const shop = await prisma.shop.findFirst({ where: { id: shansongConfig.boundShopId, userId: order.userId } });
  if (!shop) throw new Error("闪送绑定门店已失效，请前往个人中心重新绑定");
  if (!matchedShopName || matchedShopName.trim() !== shop.name.trim()) {
    throw new Error(`该订单不属于闪送绑定门店“${shop.name}”`);
  }
  const addresses = Array.isArray(user.shippingAddresses) ? user.shippingAddresses.map(asRecord) : [];
  const addressBook = addresses.find((item) => String(item.id || "") === String(shop?.addressBookId || ""))
    || addresses.find((item) => String(item.label || "").trim() === String(matchedShopName || "").trim())
    || {};
  const integration = asRecord(permissions.autoPickIntegration);
  const mappings = Array.isArray(integration.maiyatianShopMappings) ? integration.maiyatianShopMappings.map(asRecord) : [];
  const mapping = mappings.find((item) => String(item.localShopName || "").trim() === shop.name.trim()) || {};
  const raw = asRecord(order.rawPayload);
  const normalized = normalizeAutoPickOrderPayload({
    ...raw,
    id: order.sourceId,
    orderNo: order.orderNo,
    orderTime: order.orderTime.toISOString(),
    platform: order.platform,
    userAddress: order.userAddress,
    shopAddress: order.shopAddress,
    longitude: order.longitude,
    latitude: order.latitude,
    items: order.items.map((item) => ({ productName: item.productName, quantity: item.quantity })),
  });

  const senderAddress = String(shop?.address || addressBook.detailAddress || addressBook.address || order.shopAddress || "").trim();
  const senderName = String(shop.contactName || addressBook.contactName || shop.name || "").trim();
  const senderPhone = String(shop?.contactPhone || addressBook.contactPhone || readFirstText(raw, ["shop_phone", "shopPhone", "store_phone", "storePhone"]) || "").trim();
  const senderLng = Number(shop?.longitude || addressBook.longitude || 0);
  const senderLat = Number(shop?.latitude || addressBook.latitude || 0);
  const cityName = String(shop?.city || mapping.cityName || raw.cityName || raw.city_name || "").trim();

  let receiverLng = readGcjCoordinate(order.rawPayload, "longitude");
  let receiverLat = readGcjCoordinate(order.rawPayload, "latitude");
  if (!receiverLng || !receiverLat) {
    const converted = bd09ToGcj02(Number(order.longitude || 0), Number(order.latitude || 0));
    receiverLng = converted.lng;
    receiverLat = converted.lat;
  }
  const receiverName = String(normalized?.customerName || readFirstText(raw, ["real_name", "realName", "customerName", "nick_name"]) || "顾客").trim();
  const basePhone = String(normalized?.unencryptedPhone || normalized?.customerPhone || "").trim();
  const phoneExtension = String(normalized?.customerPhoneExtension || "").trim();
  const receiverPhone = phoneExtension && /^1\d{10}$/.test(basePhone) ? `${basePhone}#${phoneExtension}` : basePhone;

  const missing: string[] = [];
  if (!cityName) missing.push("门店城市");
  if (!senderAddress) missing.push("门店地址");
  if (!senderName) missing.push("门店联系人");
  if (!senderPhone) missing.push("门店联系电话");
  if (!Number.isFinite(senderLng) || !senderLng || !Number.isFinite(senderLat) || !senderLat) missing.push("门店经纬度");
  if (!order.userAddress) missing.push("顾客地址");
  if (!receiverPhone || /\*/.test(receiverPhone)) missing.push("顾客真实联系电话");
  if (!Number.isFinite(receiverLng) || !receiverLng || !Number.isFinite(receiverLat) || !receiverLat) missing.push("顾客经纬度");
  if (missing.length) throw new Error(`闪送询价缺少：${missing.join("、")}`);

  const goodsText = order.items
    .map((item) => `${item.productName}×${Math.max(1, item.quantity)}`)
    .filter(Boolean)
    .join("、");
  const remarks = truncate([order.customerRemark, goodsText].filter(Boolean).join("；"), 300);
  return {
    cityName,
    appointType: 0,
    storeName: truncate(shop.name, 20) || undefined,
    travelWay: 0,
    deliveryType: 1,
    pickupPwd: 0,
    deliveryPwd: 0,
    lbsType: 1,
    sender: {
      fromAddress: truncate(senderAddress, 100),
      fromAddressDetail: "",
      fromSenderName: truncate(senderName, 30),
      fromMobile: senderPhone,
      fromLatitude: String(senderLat),
      fromLongitude: String(senderLng),
    },
    receiverList: [{
      orderNo: order.id,
      toAddress: truncate(order.userAddress, 100),
      toAddressDetail: "",
      toLatitude: String(receiverLat),
      toLongitude: String(receiverLng),
      toReceiverName: truncate(receiverName, 30),
      toMobile: receiverPhone,
      goodType: inferGoodType(order.items),
      weight: 1,
      remarks,
      orderingSourceType: 5,
      orderingSourceNo: truncate(order.orderNo, 16),
    }],
  };
}

export async function quoteShansongDelivery(order: ShansongOrder): Promise<ShansongQuoteOption> {
  const data = await buildCalculatePayload(order);
  const quote = await callShansongApi<ShansongCalculateResponse>(order.userId, "/openapi/developer/v5/orderCalculate", data);
  const orderNumber = String(quote?.orderNumber || "").trim();
  if (!orderNumber) throw new Error("闪送询价成功但未返回闪送订单号");
  const estimateSeconds = Number(quote.estimateReceiveSecond || 0);
  return {
    provider: "shansong",
    logisticId: orderNumber,
    logisticTag: "shansong-official",
    name: "闪送（个人账号）",
    servicePkg: "direct",
    amount: Math.max(0, Number(quote.totalFeeAfterSave ?? quote.totalAmount ?? 0)),
    distance: Math.max(0, Number(quote.totalDistance || 0)) / 1000,
    estimatedDeliveryTime: estimateSeconds > 0 ? Math.ceil(estimateSeconds / 60) : undefined,
  };
}

export async function placeShansongOrder(userId: string, issOrderNo: string) {
  return callShansongApi<ShansongCalculateResponse>(userId, "/openapi/developer/v5/orderPlace", { issOrderNo });
}

export async function cancelShansongAuthorization(userId: string) {
  const app = getAppConfig();
  const stored = await getStoredConfig(userId);
  if (app.configured && stored.accessToken) {
    const data = JSON.stringify({ accessToken: stored.accessToken });
    const timestamp = String(Date.now());
    const baseParams = { clientId: app.clientId, data, timestamp };
    await postForm(`${app.baseUrl}/openapi/oauth/cancel`, {
      ...baseParams,
      sign: signParams(app.appSecret, baseParams),
    });
  }
  const permissions = await readUserPermissions(userId);
  delete permissions[CONFIG_KEY];
  await prisma.user.update({
    where: { id: userId },
    data: { permissions: permissions as Prisma.InputJsonValue },
  });
}
