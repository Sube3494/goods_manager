import { createHash } from "crypto";
import { Prisma } from "../../prisma/generated-client";
import prisma from "@/lib/prisma";
import type {
  TTLockIntegrationConfig,
  TTLockIntegrationConfigPublic,
  TTLockLockDetail,
  TTLockLockSummary,
  TTLockRegion,
} from "@/lib/types";

type TTLockTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  uid?: number;
  expires_in?: number;
  errcode?: number;
  errmsg?: string;
  description?: string;
};

type TTLockListResponse = {
  list?: unknown[];
  errcode?: number;
  errmsg?: string;
  pages?: number;
  pageNo?: number;
  pageSize?: number;
  total?: number;
};

type TTLockDetailResponse = Record<string, unknown> & {
  errcode?: number;
  errmsg?: string;
};

type TTLockUnlockResponse = {
  errcode?: number;
  errmsg?: string;
  keyboardPwd?: string;
};

const TTLOCK_CN_API_BASE = "https://cnapi.ttlock.com";
const TTLOCK_GLOBAL_API_BASE = "https://api.sciener.com";
const ACCESS_TOKEN_LEEWAY_MS = 5 * 60 * 1000;

type TTLockSystemCredentials = {
  clientId: string;
  clientSecret: string;
  region: TTLockRegion;
  enabled: boolean;
  source: "settings" | "env" | "none";
};

function asPrismaJsonValue<T>(value: T): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

function nowMs() {
  return Date.now();
}

function getRegionBaseUrl(region: TTLockRegion) {
  return region === "global" ? TTLOCK_GLOBAL_API_BASE : TTLOCK_CN_API_BASE;
}

function normalizeRegion(value: unknown): TTLockRegion {
  return String(value || "").trim().toLowerCase() === "global" ? "global" : "cn";
}

function normalizeOptionalIso(value: unknown) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeOptionalPositiveInt(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.floor(numeric);
}

function toTTLockUserMessage(input: unknown) {
  const rawMessage = String(input || "").trim();
  const normalized = rawMessage.toLowerCase();

  if (!rawMessage) {
    return "TTLock 服务暂时不可用，请稍后重试";
  }

  if (
    normalized.includes("clientid")
    || normalized.includes("client id")
    || normalized.includes("invalid client")
  ) {
    return "TTLock Client ID 配置有误，请到系统设置检查应用 ID";
  }

  if (
    normalized.includes("clientsecret")
    || normalized.includes("client secret")
    || normalized.includes("secret invalid")
  ) {
    return "TTLock Client Secret 配置有误，请到系统设置检查应用密钥";
  }

  if (normalized.includes("username") || normalized.includes("account")) {
    return "TTLock App 账号有误，请检查后重新登录";
  }

  if (normalized.includes("password")) {
    return "TTLock App 密码有误，请检查后重新登录";
  }

  if (normalized.includes("refresh token")) {
    return "TTLock 授权已失效，请重新登录并重新获取门锁";
  }

  if (normalized.includes("access token") || normalized.includes("token invalid")) {
    return "TTLock 授权状态异常，请重新登录并重新获取门锁";
  }

  if (normalized.includes("grant_type")) {
    return "TTLock 授权参数异常，请到系统设置检查 TTLock 配置";
  }

  if (
    normalized.includes("fetch failed")
    || normalized.includes("network")
    || normalized.includes("econn")
    || normalized.includes("timed out")
    || normalized.includes("timeout")
  ) {
    return "TTLock 服务连接失败，请稍后重试";
  }

  if (normalized.includes("http 401") || normalized.includes("unauthorized")) {
    return "TTLock 授权失败，请检查系统参数和账号密码后重试";
  }

  if (normalized.includes("http 5")) {
    return "TTLock 服务器暂时异常，请稍后重试";
  }

  return rawMessage;
}

function md5LowerCase(value: string) {
  return createHash("md5").update(value).digest("hex").toLowerCase();
}

export function getDefaultTTLockIntegrationConfig(): TTLockIntegrationConfig {
  return {
    region: "cn",
    clientId: "",
    clientSecret: "",
    username: "",
    passwordMd5: "",
    accessToken: "",
    refreshToken: "",
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    ttlockUserId: null,
    defaultLockId: null,
    lastAuthorizedAt: null,
    lastTokenError: null,
  };
}

async function getSystemTTLockCredentials(): Promise<TTLockSystemCredentials> {
  const settings = await prisma.systemSetting.findUnique({
    where: { id: "system" },
    select: {
      ttlockClientId: true,
      ttlockClientSecret: true,
      ttlockRegion: true,
    },
  });

  const settingsClientId = String(settings?.ttlockClientId || "").trim();
  const settingsClientSecret = String(settings?.ttlockClientSecret || "").trim();
  if (settingsClientId && settingsClientSecret) {
    return {
      clientId: settingsClientId,
      clientSecret: settingsClientSecret,
      region: normalizeRegion(settings?.ttlockRegion || "cn"),
      enabled: true,
      source: "settings",
    };
  }

  const envClientId = String(process.env.TTLOCK_CLIENT_ID || "").trim();
  const envClientSecret = String(process.env.TTLOCK_CLIENT_SECRET || "").trim();
  if (envClientId && envClientSecret) {
    return {
      clientId: envClientId,
      clientSecret: envClientSecret,
      region: normalizeRegion(process.env.TTLOCK_REGION || "cn"),
      enabled: true,
      source: "env",
    };
  }

  return {
    clientId: "",
    clientSecret: "",
    region: "cn",
    enabled: false,
    source: "none",
  };
}

export function normalizeTTLockIntegrationConfig(input: unknown, systemCredentials?: Partial<TTLockSystemCredentials>): TTLockIntegrationConfig {
  const payload = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const hasSystemCredentials = Boolean(systemCredentials?.enabled && systemCredentials?.clientId && systemCredentials?.clientSecret);

  return {
    region: hasSystemCredentials ? normalizeRegion(systemCredentials?.region || "cn") : normalizeRegion(payload.region),
    clientId: hasSystemCredentials ? String(systemCredentials?.clientId || "").trim() : String(payload.clientId || "").trim(),
    clientSecret: hasSystemCredentials ? String(systemCredentials?.clientSecret || "").trim() : String(payload.clientSecret || "").trim(),
    username: String(payload.username || "").trim(),
    passwordMd5: String(payload.passwordMd5 || "").trim().toLowerCase(),
    accessToken: String(payload.accessToken || "").trim(),
    refreshToken: String(payload.refreshToken || "").trim(),
    accessTokenExpiresAt: normalizeOptionalIso(payload.accessTokenExpiresAt),
    refreshTokenExpiresAt: normalizeOptionalIso(payload.refreshTokenExpiresAt),
    ttlockUserId: normalizeOptionalPositiveInt(payload.ttlockUserId),
    defaultLockId: normalizeOptionalPositiveInt(payload.defaultLockId),
    lastAuthorizedAt: normalizeOptionalIso(payload.lastAuthorizedAt),
    lastTokenError: String(payload.lastTokenError || "").trim() || null,
  };
}

export function toPublicTTLockIntegrationConfig(config: TTLockIntegrationConfig, systemCredentials?: Partial<TTLockSystemCredentials>): TTLockIntegrationConfigPublic {
  const hasSystemCredentials = Boolean(systemCredentials?.enabled && systemCredentials?.clientId && systemCredentials?.clientSecret);
  return {
    region: config.region,
    clientId: hasSystemCredentials ? "" : config.clientId,
    clientSecret: hasSystemCredentials ? "" : config.clientSecret,
    usesSystemCredentials: hasSystemCredentials,
    username: config.username,
    hasPassword: Boolean(config.passwordMd5),
    linked: Boolean(config.accessToken),
    accessTokenExpiresAt: config.accessTokenExpiresAt,
    refreshTokenExpiresAt: config.refreshTokenExpiresAt,
    ttlockUserId: config.ttlockUserId,
    defaultLockId: config.defaultLockId,
    lastAuthorizedAt: config.lastAuthorizedAt,
    lastTokenError: config.lastTokenError,
  };
}

async function getUserPermissionsRecord(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { permissions: true },
  });

  return user?.permissions && typeof user.permissions === "object" && !Array.isArray(user.permissions)
    ? { ...(user.permissions as Record<string, unknown>) }
    : {};
}

export async function getTTLockIntegrationConfigByUserId(userId: string) {
  const systemCredentials = await getSystemTTLockCredentials();
  const permissions = await getUserPermissionsRecord(userId);
  return normalizeTTLockIntegrationConfig(permissions.ttlockIntegration, systemCredentials);
}

export async function getPublicTTLockIntegrationConfigByUserId(userId: string) {
  const [config, systemCredentials] = await Promise.all([
    getTTLockIntegrationConfigByUserId(userId),
    getSystemTTLockCredentials(),
  ]);
  return toPublicTTLockIntegrationConfig(config, systemCredentials);
}

async function saveTTLockIntegrationConfigByUserId(userId: string, config: TTLockIntegrationConfig) {
  const systemCredentials = await getSystemTTLockCredentials();
  const permissions = await getUserPermissionsRecord(userId);
  const nextPermissions: Record<string, unknown> = {
    ...permissions,
    ttlockIntegration: normalizeTTLockIntegrationConfig(config, systemCredentials),
  };

  await prisma.user.update({
    where: { id: userId },
    data: {
      permissions: asPrismaJsonValue(nextPermissions),
    },
  });

  return normalizeTTLockIntegrationConfig(nextPermissions.ttlockIntegration, systemCredentials);
}

export async function updateTTLockIntegrationConfigByUserId(userId: string, input: unknown) {
  const current = await getTTLockIntegrationConfigByUserId(userId);
  const systemCredentials = await getSystemTTLockCredentials();
  const payload = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};

  const plainPassword = String(payload.password || "").trim();
  const passwordMd5 = String(payload.passwordMd5 || "").trim().toLowerCase();
  const shouldClearToken = [
    current.region !== normalizeRegion(payload.region ?? current.region),
    current.clientId !== String(payload.clientId ?? current.clientId).trim(),
    current.clientSecret !== String(payload.clientSecret ?? current.clientSecret).trim(),
    current.username !== String(payload.username ?? current.username).trim(),
    Boolean(plainPassword),
    Boolean(passwordMd5 && passwordMd5 !== current.passwordMd5),
  ].some(Boolean);

  const next = normalizeTTLockIntegrationConfig({
    ...current,
    ...payload,
    clientId: systemCredentials.enabled ? current.clientId : payload.clientId,
    clientSecret: systemCredentials.enabled ? current.clientSecret : payload.clientSecret,
    region: systemCredentials.enabled ? current.region : payload.region,
    passwordMd5: plainPassword ? md5LowerCase(plainPassword) : (passwordMd5 || current.passwordMd5),
  }, systemCredentials);

  if (shouldClearToken) {
    next.accessToken = "";
    next.refreshToken = "";
    next.accessTokenExpiresAt = null;
    next.refreshTokenExpiresAt = null;
    next.ttlockUserId = null;
    next.lastAuthorizedAt = null;
    next.lastTokenError = null;
  }

  return await saveTTLockIntegrationConfigByUserId(userId, next);
}

function assertTTLockSuccess<T extends { errcode?: number; errmsg?: string }>(payload: T) {
  const errcode = Number(payload?.errcode ?? 0);
  if (Number.isFinite(errcode) && errcode !== 0) {
    const message = toTTLockUserMessage(payload?.errmsg || "TTLock request failed");
    throw new Error(`${message} (code: ${errcode})`);
  }
  return payload;
}

async function postTTLockForm<T>(config: TTLockIntegrationConfig, path: string, form: Record<string, string | number>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(form)) {
    body.set(key, String(value));
  }

  const response = await fetch(`${getRegionBaseUrl(config.region)}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
    cache: "no-store",
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) as T : {} as T;

  if (!response.ok) {
    const message = typeof payload === "object" && payload && "errmsg" in payload
      ? toTTLockUserMessage((payload as { errmsg?: string }).errmsg || "")
      : "";
    throw new Error(message || toTTLockUserMessage(`TTLock HTTP ${response.status}`));
  }

  return payload;
}

async function getTTLockJson<T>(config: TTLockIntegrationConfig, path: string, params: Record<string, string | number>) {
  const url = new URL(path, `${getRegionBaseUrl(config.region)}/`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) as T : {} as T;

  if (!response.ok) {
    const message = typeof payload === "object" && payload && "errmsg" in payload
      ? toTTLockUserMessage((payload as { errmsg?: string }).errmsg || "")
      : "";
    throw new Error(message || toTTLockUserMessage(`TTLock HTTP ${response.status}`));
  }

  return payload;
}

function getRequiredTTLockCredentials(config: TTLockIntegrationConfig) {
  if (!config.clientId || !config.clientSecret) {
    throw new Error("系统里的 TTLock Client ID 或 Client Secret 还没配置好，请先到系统设置检查");
  }
  if (!config.username || !config.passwordMd5) {
    throw new Error("请先填写 TTLock App 账号和密码");
  }
}

export async function issueTTLockAccessTokenByUserId(userId: string) {
  const config = await getTTLockIntegrationConfigByUserId(userId);
  getRequiredTTLockCredentials(config);

  const payload = assertTTLockSuccess(await postTTLockForm<TTLockTokenResponse>(config, "/oauth2/token", {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    username: config.username,
    password: config.passwordMd5,
  }));

  const expiresInMs = Math.max(0, Number(payload.expires_in || 0)) * 1000;
  const next = normalizeTTLockIntegrationConfig({
    ...config,
    accessToken: String(payload.access_token || "").trim(),
    refreshToken: String(payload.refresh_token || "").trim(),
    accessTokenExpiresAt: expiresInMs > 0 ? new Date(nowMs() + expiresInMs).toISOString() : null,
    refreshTokenExpiresAt: config.refreshTokenExpiresAt,
    ttlockUserId: normalizeOptionalPositiveInt(payload.uid),
    lastAuthorizedAt: new Date().toISOString(),
    lastTokenError: null,
  });

  return await saveTTLockIntegrationConfigByUserId(userId, next);
}

export async function refreshTTLockAccessTokenByUserId(userId: string) {
  const config = await getTTLockIntegrationConfigByUserId(userId);
  if (!config.clientId || !config.clientSecret) {
    throw new Error("系统里的 TTLock Client ID 或 Client Secret 还没配置好，请先到系统设置检查");
  }
  if (!config.refreshToken) {
    throw new Error("当前没有可用的 refresh token，请重新授权");
  }

  const payload = assertTTLockSuccess(await postTTLockForm<TTLockTokenResponse>(config, "/oauth2/token", {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: config.refreshToken,
  }));

  const expiresInMs = Math.max(0, Number(payload.expires_in || 0)) * 1000;
  const next = normalizeTTLockIntegrationConfig({
    ...config,
    accessToken: String(payload.access_token || "").trim(),
    refreshToken: String(payload.refresh_token || config.refreshToken).trim(),
    accessTokenExpiresAt: expiresInMs > 0 ? new Date(nowMs() + expiresInMs).toISOString() : null,
    ttlockUserId: normalizeOptionalPositiveInt(payload.uid) || config.ttlockUserId,
    lastAuthorizedAt: new Date().toISOString(),
    lastTokenError: null,
  });

  return await saveTTLockIntegrationConfigByUserId(userId, next);
}

async function markTTLockTokenError(userId: string, message: string) {
  const config = await getTTLockIntegrationConfigByUserId(userId);
  return await saveTTLockIntegrationConfigByUserId(userId, {
    ...config,
    lastTokenError: toTTLockUserMessage(message).slice(0, 500),
  });
}

export async function ensureTTLockAccessTokenByUserId(userId: string) {
  const config = await getTTLockIntegrationConfigByUserId(userId);
  const expiryTime = config.accessTokenExpiresAt ? new Date(config.accessTokenExpiresAt).getTime() : 0;
  const isUsable = Boolean(config.accessToken) && expiryTime > nowMs() + ACCESS_TOKEN_LEEWAY_MS;

  if (isUsable) {
    return config;
  }

  try {
    if (config.refreshToken) {
      return await refreshTTLockAccessTokenByUserId(userId);
    }
    return await issueTTLockAccessTokenByUserId(userId);
  } catch (error) {
    const message = error instanceof Error ? toTTLockUserMessage(error.message) : "TTLock token unavailable";
    await markTTLockTokenError(userId, message).catch(() => null);
    throw new Error(message);
  }
}

function mapTTLockLockSummary(item: unknown): TTLockLockSummary | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return null;
  }

  const record = item as Record<string, unknown>;
  const lockId = normalizeOptionalPositiveInt(record.lockId);
  if (!lockId) {
    return null;
  }

  return {
    lockId,
    lockName: String(record.lockName || "").trim() || `Lock ${lockId}`,
    lockAlias: String(record.lockAlias || "").trim() || null,
    lockMac: String(record.lockMac || "").trim() || null,
    electricQuantity: Number.isFinite(Number(record.electricQuantity)) ? Number(record.electricQuantity) : null,
    hasGateway: typeof record.hasGateway === "boolean"
      ? record.hasGateway
      : Number.isFinite(Number(record.hasGateway))
        ? Number(record.hasGateway) === 1
        : null,
    wifiState: Number.isFinite(Number(record.wifiState)) ? Number(record.wifiState) : null,
    groupId: normalizeOptionalPositiveInt(record.groupId),
    groupName: String(record.groupName || "").trim() || null,
    featureValue: String(record.featureValue || "").trim() || null,
    date: Number.isFinite(Number(record.date)) ? Number(record.date) : null,
  };
}

function mapTTLockLockDetail(item: TTLockDetailResponse): TTLockLockDetail {
  const summary = mapTTLockLockSummary(item) || {
    lockId: normalizeOptionalPositiveInt(item.lockId) || 0,
    lockName: String(item.lockName || "").trim() || "未命名门锁",
  };

  return {
    ...summary,
    noKeyPwd: String(item.noKeyPwd || "").trim() || null,
    timezoneRawOffset: Number.isFinite(Number(item.timezoneRawOffset)) ? Number(item.timezoneRawOffset) : null,
    modelNum: String(item.modelNum || "").trim() || null,
    hardwareRevision: String(item.hardwareRevision || "").trim() || null,
    firmwareRevision: String(item.firmwareRevision || "").trim() || null,
    autoLockTime: Number.isFinite(Number(item.autoLockTime)) ? Number(item.autoLockTime) : null,
    lockSound: Number.isFinite(Number(item.lockSound)) ? Number(item.lockSound) : null,
    soundVolume: Number.isFinite(Number(item.soundVolume)) ? Number(item.soundVolume) : null,
    privacyLock: Number.isFinite(Number(item.privacyLock)) ? Number(item.privacyLock) : null,
    passageMode: Number.isFinite(Number(item.passageMode)) ? Number(item.passageMode) : null,
    passageModeAutoUnlock: Number.isFinite(Number(item.passageModeAutoUnlock)) ? Number(item.passageModeAutoUnlock) : null,
    tamperAlert: Number.isFinite(Number(item.tamperAlert)) ? Number(item.tamperAlert) : null,
    resetButton: Number.isFinite(Number(item.resetButton)) ? Number(item.resetButton) : null,
    openDirection: Number.isFinite(Number(item.openDirection)) ? Number(item.openDirection) : null,
    keyboardPwdVersion: Number.isFinite(Number(item.keyboardPwdVersion)) ? Number(item.keyboardPwdVersion) : null,
    specialValue: Number.isFinite(Number(item.specialValue)) ? Number(item.specialValue) : null,
  };
}

export async function listTTLocksByUserId(userId: string, options?: { pageNo?: number; pageSize?: number; lockAlias?: string }) {
  const config = await ensureTTLockAccessTokenByUserId(userId);
  const systemCredentials = await getSystemTTLockCredentials();
  const payload = assertTTLockSuccess(await getTTLockJson<TTLockListResponse>(config, "/v3/lock/list", {
    clientId: config.clientId,
    accessToken: config.accessToken,
    pageNo: Math.max(1, Number(options?.pageNo || 1)),
    pageSize: Math.min(1000, Math.max(1, Number(options?.pageSize || 100))),
    date: nowMs(),
    ...(options?.lockAlias ? { lockAlias: options.lockAlias.trim() } : {}),
  }));

  return {
    locks: Array.isArray(payload.list)
      ? payload.list.map((item) => mapTTLockLockSummary(item)).filter((item): item is TTLockLockSummary => Boolean(item))
      : [],
    pageNo: Number(payload.pageNo || options?.pageNo || 1),
    pageSize: Number(payload.pageSize || options?.pageSize || 100),
    total: Number(payload.total || 0),
    pages: Number(payload.pages || 0),
    config: toPublicTTLockIntegrationConfig(config, systemCredentials),
  };
}

export async function getTTLockDetailByUserId(userId: string, lockId: number) {
  const config = await ensureTTLockAccessTokenByUserId(userId);
  const systemCredentials = await getSystemTTLockCredentials();
  const payload = assertTTLockSuccess(await getTTLockJson<TTLockDetailResponse>(config, "/v3/lock/detail", {
    clientId: config.clientId,
    accessToken: config.accessToken,
    lockId,
    date: nowMs(),
  }));

  return {
    lock: mapTTLockLockDetail(payload),
    config: toPublicTTLockIntegrationConfig(config, systemCredentials),
  };
}

export async function unlockTTLockByUserId(userId: string, lockId: number) {
  const config = await ensureTTLockAccessTokenByUserId(userId);
  const systemCredentials = await getSystemTTLockCredentials();
  const payload = assertTTLockSuccess(await postTTLockForm<TTLockUnlockResponse>(config, "/v3/lock/unlock", {
    clientId: config.clientId,
    accessToken: config.accessToken,
    lockId,
    date: nowMs(),
  }));

  return {
    success: true,
    keyboardPwd: String(payload.keyboardPwd || "").trim() || null,
    config: toPublicTTLockIntegrationConfig(config, systemCredentials),
  };
}

export async function findAuthorizedTTLockUserId(): Promise<string | null> {
  const users = await prisma.user.findMany({
    select: { id: true, permissions: true }
  });
  
  for (const user of users) {
    if (user.permissions && typeof user.permissions === "object") {
      const perms = user.permissions as Record<string, any>;
      const ttlock = perms.ttlockIntegration;
      if (ttlock && typeof ttlock === "object" && ttlock.username && (ttlock.accessToken || ttlock.passwordMd5)) {
        return user.id;
      }
    }
  }
  return null;
}
