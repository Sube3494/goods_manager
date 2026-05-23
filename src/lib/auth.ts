import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies, headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SessionUser, hasPermission, Permission, AdminCapability, hasAdminAccess } from "./permissions";
import type { SystemSetting } from "../../prisma/generated-client";
import { randomUUID } from "crypto";

async function getPrismaClient() {
  const { default: prisma } = await import("./prisma");
  return prisma;
}

function getJwtKey() {
  const secretKey = process.env.JWT_SECRET;
  if (!secretKey) {
    throw new Error("JWT_SECRET is required");
  }
  return new TextEncoder().encode(secretKey);
}

const baseSessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
};

function isLocalHostname(hostname: string) {
  const normalized = String(hostname || "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1") {
    return true;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) {
    return normalized.startsWith("10.")
      || normalized.startsWith("127.")
      || normalized.startsWith("192.168.")
      || /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized);
  }
  return false;
}

async function getSessionCookieOptions() {
  const headerStore = await headers();
  const hostHeader = String(headerStore.get("x-forwarded-host") || headerStore.get("host") || "").trim();
  const forwardedProto = String(headerStore.get("x-forwarded-proto") || "").trim().toLowerCase();
  const hostname = hostHeader.split(":")[0] || "";
  const isHttps = forwardedProto === "https";
  const secure = process.env.NODE_ENV === "production" && !isLocalHostname(hostname) && isHttps;

  return {
    ...baseSessionCookieOptions,
    secure,
  };
}

export const SESSION_DURATION = 60 * 60 * 24 * 7; // 1 week
const LAST_ACTIVE_UPDATE_INTERVAL_MS = 5 * 60 * 1000;
const ONLINE_DEVICE_WINDOW_MS = 10 * 60 * 1000;

type SessionPayload = JWTPayload & {
  expires: Date;
  sessionId?: string;
};

type ClientDeviceInfo = {
  deviceType: "desktop" | "mobile" | "tablet";
  deviceLabel: string;
  browser: string;
  os: string;
  ipAddress: string | null;
};

export async function encrypt(payload: JWTPayload) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtKey());
}

export async function decrypt(input: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(input, getJwtKey(), {
    algorithms: ["HS256"],
  });
  return payload;
}

function detectBrowser(userAgent: string) {
  if (/Edg\//i.test(userAgent)) return "Edge";
  if (/OPR\//i.test(userAgent)) return "Opera";
  if (/Chrome\//i.test(userAgent) && !/Edg\//i.test(userAgent)) return "Chrome";
  if (/Firefox\//i.test(userAgent)) return "Firefox";
  if (/Safari\//i.test(userAgent) && !/Chrome\//i.test(userAgent)) return "Safari";
  return "浏览器";
}

function detectOs(userAgent: string) {
  if (/iPad|iPhone|iPod/i.test(userAgent)) return "iPhone";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(userAgent)) return "macOS";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "未知系统";
}

function detectDeviceType(userAgent: string): ClientDeviceInfo["deviceType"] {
  if (/iPad|Tablet/i.test(userAgent)) return "tablet";
  if (/Mobile|iPhone|Android/i.test(userAgent)) return "mobile";
  return "desktop";
}

async function getClientDeviceInfo(): Promise<ClientDeviceInfo> {
  const headerStore = await headers();
  const userAgent = String(headerStore.get("user-agent") || "").trim();
  const browser = detectBrowser(userAgent);
  const os = detectOs(userAgent);
  const deviceType = detectDeviceType(userAgent);
  const forwardedFor = String(headerStore.get("x-forwarded-for") || "").split(",")[0]?.trim() || "";
  const realIp = String(headerStore.get("x-real-ip") || "").trim();
  const ipAddress = forwardedFor || realIp || null;

  return {
    deviceType,
    deviceLabel: `${os} ${browser}`,
    browser,
    os,
    ipAddress,
  };
}

async function upsertUserDeviceSession(userId: string, sessionId: string, now: Date) {
  const prisma = await getPrismaClient();
  const deviceInfo = await getClientDeviceInfo();

  await prisma.userDeviceSession.upsert({
    where: { sessionId },
    update: {
      lastSeenAt: now,
      endedAt: null,
      deviceType: deviceInfo.deviceType,
      deviceLabel: deviceInfo.deviceLabel,
      browser: deviceInfo.browser,
      os: deviceInfo.os,
      ipAddress: deviceInfo.ipAddress,
    },
    create: {
      userId,
      sessionId,
      deviceType: deviceInfo.deviceType,
      deviceLabel: deviceInfo.deviceLabel,
      browser: deviceInfo.browser,
      os: deviceInfo.os,
      ipAddress: deviceInfo.ipAddress,
      lastSeenAt: now,
    },
  });
}

async function getMaxLoginDevicesLimit() {
  try {
    const settings = await getCachedSettings();
    const rawValue = Number(settings?.maxLoginDevices ?? 2);
    return Number.isFinite(rawValue) && rawValue >= 1 ? Math.floor(rawValue) : 2;
  } catch {
    return 2;
  }
}

async function enforceMaxLoginDevices(userId: string, keepSessionId: string) {
  const prisma = await getPrismaClient();
  const limit = await getMaxLoginDevicesLimit();
  const activeSessions = await prisma.userDeviceSession.findMany({
    where: {
      userId,
      endedAt: null,
    },
    orderBy: [
      { createdAt: "asc" },
      { lastSeenAt: "asc" },
    ],
    select: {
      id: true,
      sessionId: true,
    },
  });

  if (activeSessions.length <= limit) {
    return;
  }

  const overflow = activeSessions.length - limit;
  const removable = activeSessions.filter((item) => item.sessionId !== keepSessionId).slice(0, overflow);

  if (removable.length === 0) {
    return;
  }

  await prisma.userDeviceSession.updateMany({
    where: {
      id: { in: removable.map((item) => item.id) },
      endedAt: null,
    },
    data: {
      endedAt: new Date(),
    },
  });
}

async function touchUserDeviceSession(userId: string, sessionId: string, now: Date) {
  const prisma = await getPrismaClient();
  const existing = await prisma.userDeviceSession.findUnique({
    where: { sessionId },
    select: { lastSeenAt: true, userId: true, endedAt: true },
  });

  if (!existing || existing.userId !== userId) {
    await upsertUserDeviceSession(userId, sessionId, now);
    return;
  }

  if (existing.endedAt) {
    return;
  }

  if (now.getTime() - existing.lastSeenAt.getTime() < LAST_ACTIVE_UPDATE_INTERVAL_MS) {
    return;
  }

  const deviceInfo = await getClientDeviceInfo();
  await prisma.userDeviceSession.update({
    where: { sessionId },
    data: {
      lastSeenAt: now,
      endedAt: null,
      deviceType: deviceInfo.deviceType,
      deviceLabel: deviceInfo.deviceLabel,
      browser: deviceInfo.browser,
      os: deviceInfo.os,
      ipAddress: deviceInfo.ipAddress,
    },
  });
}

async function endUserDeviceSession(sessionId: string) {
  const prisma = await getPrismaClient();
  await prisma.userDeviceSession.updateMany({
    where: { sessionId, endedAt: null },
    data: { endedAt: new Date() },
  });
}

export async function getSession() {
  const session = (await cookies()).get("session")?.value;
  if (!session) return null;
  try {
    return await decrypt(session);
  } catch {
    return null;
  }
}

/**
 * Gets a session with fresh user data from the database
 */
export async function getFreshSession() {
  const session = await getSession();
  if (!session || !session.user) return null;
  const prisma = await getPrismaClient();

  const user = await prisma.user.findUnique({
    where: { id: (session.user as { id: string }).id },
    include: { roleProfile: true }
  });

  if (!user || user.status === "DISABLED") return null;

  // Extra safety: verify user is still in the whitelist (unless Super Admin)
  if (user.role !== "SUPER_ADMIN") {
    const whitelisted = await prisma.emailWhitelist.findUnique({
      where: { email: user.email.toLowerCase() }
    });
    if (!whitelisted) return null;
  }

  const now = new Date();
  const shouldRefreshLastActiveAt = !user.lastActiveAt
    || now.getTime() - user.lastActiveAt.getTime() >= LAST_ACTIVE_UPDATE_INTERVAL_MS;

  if (shouldRefreshLastActiveAt) {
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { lastActiveAt: now },
      });
      user.lastActiveAt = now;
    } catch (error) {
      console.error("Failed to update user last active time:", error);
    }
  }

  const sessionId = typeof (session as SessionPayload).sessionId === "string"
    ? (session as SessionPayload).sessionId
    : null;
  if (sessionId) {
    try {
      const prisma = await getPrismaClient();
      const currentDeviceSession = await prisma.userDeviceSession.findUnique({
        where: { sessionId },
        select: { endedAt: true },
      });
      if (!currentDeviceSession || currentDeviceSession.endedAt) {
        return null;
      }
      await touchUserDeviceSession(user.id, sessionId, now);
    } catch (error) {
      console.error("Failed to touch user device session:", error);
    }
  }

  return {
    ...session,
    id: user.id,
    email: user.email,
    role: user.role,
    permissions: user.permissions as Record<string, boolean>,
    roleProfile: user.roleProfile,
    user: {
      ...user,
      id: user.id,
      email: user.email,
      role: user.role,
      permissions: user.permissions
    }
  };
}

export async function login(userData: Partial<SessionUser>) {
  const expires = new Date(Date.now() + SESSION_DURATION * 1000);
  const sessionId = randomUUID();
  const sessionCookieOptions = await getSessionCookieOptions();
  const session = await encrypt({ 
    ...userData,
    sessionId,
    user: userData, 
    expires 
  });
  
  (await cookies()).set("session", session, { ...sessionCookieOptions, expires });

  if (userData.id) {
    try {
      await upsertUserDeviceSession(userData.id, sessionId, new Date());
      await enforceMaxLoginDevices(userData.id, sessionId);
    } catch (error) {
      console.error("Failed to create user device session:", error);
    }
  }
}

export async function logout() {
  const sessionCookieOptions = await getSessionCookieOptions();
  const session = (await cookies()).get("session")?.value;
  if (session) {
    try {
      const parsed = await decrypt(session) as SessionPayload;
      if (typeof parsed.sessionId === "string" && parsed.sessionId) {
        await endUserDeviceSession(parsed.sessionId);
      }
    } catch (error) {
      console.error("Failed to end user device session:", error);
    }
  }
  (await cookies()).set("session", "", { ...sessionCookieOptions, expires: new Date(0) });
}

export async function updateSession(request: NextRequest) {
  const session = request.cookies.get("session")?.value;
  if (!session) return;

  try {
    const parsed = await decrypt(session) as SessionPayload;
    parsed.expires = new Date(Date.now() + SESSION_DURATION * 1000);
    const sessionCookieOptions = await getSessionCookieOptions();
    const res = NextResponse.next();
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
    res.cookies.set({
      name: "session",
      value: await encrypt(parsed),
      ...sessionCookieOptions,
      expires: parsed.expires,
    });
    return res;
  } catch {
    return;
  }
}

export function getOnlineDeviceCutoff() {
  return new Date(Date.now() - ONLINE_DEVICE_WINDOW_MS);
}

/**
 * Lightweight session retrieval: Prioritizes headers injected by middleware/proxy,
 * then falls back to JWT decoding. DOES NOT hit the database.
 */
export async function getLightSession(): Promise<Partial<SessionUser> | null> {
    const headerPayload = await headers();
    const role = headerPayload.get("x-user-role");
    const id = headerPayload.get("x-user-id");
    if (id && role) {
        return { id, role: role as "SUPER_ADMIN" | "USER" };
    }

    const session = (await cookies()).get("session")?.value;
    if (!session) return null;
    try {
        const payload = await decrypt(session);
        return {
            id: payload.id as string,
            email: payload.email as string,
            role: payload.role as "SUPER_ADMIN" | "USER",
            name: payload.name as string,
        };
    } catch {
        return null;
    }
}

let settingsCache: SystemSetting | null = null;
let lastSettingsFetch = 0;
const SETTINGS_CACHE_TTL = 60 * 1000;

export async function getCachedSettings() {
    const now = Date.now();
    if (settingsCache && (now - lastSettingsFetch < SETTINGS_CACHE_TTL)) {
        return settingsCache;
    }
    const prisma = await getPrismaClient();
    settingsCache = await prisma.systemSetting.findFirst();
    lastSettingsFetch = now;
    return settingsCache;
}

/**
 * 统一的 API 路由权限校验辅助函数
 * @param permission 需要校验的权限点
 */
export async function getAuthorizedUser(permission?: Permission): Promise<SessionUser | null> {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.id) return null;
    
    if (permission && !hasPermission(session, permission)) {
        return null;
    }
    
    return session;
}

export async function getAuthorizedUserAny(...permissions: Permission[]): Promise<SessionUser | null> {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.id) return null;

    if (permissions.length > 0 && !permissions.some((permission) => hasPermission(session, permission))) {
        return null;
    }

    return session;
}

export async function getAuthorizedAdmin(capability: AdminCapability): Promise<SessionUser | null> {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.id) return null;

    if (!hasAdminAccess(session, capability)) {
        return null;
    }

    return session;
}

export async function getAuthorizedAdminAny(...capabilities: AdminCapability[]): Promise<SessionUser | null> {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.id) return null;

    if (!capabilities.some((capability) => hasAdminAccess(session, capability))) {
        return null;
    }

    return session;
}
