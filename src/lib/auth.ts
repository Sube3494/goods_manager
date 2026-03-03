import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies, headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import prisma from "./prisma";
import { SessionUser, hasPermission, Permission } from "./permissions";
import { SystemSetting } from "../../prisma/generated-client";

const secretKey = process.env.JWT_SECRET || "default-secret-key-change-in-prod";
const key = new TextEncoder().encode(secretKey);

export const SESSION_DURATION = 60 * 60 * 24 * 7; // 1 week

export async function encrypt(payload: JWTPayload) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key);
}

export async function decrypt(input: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(input, key, {
    algorithms: ["HS256"],
  });
  return payload;
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

  const user = await prisma.user.findUnique({
    where: { id: (session.user as { id: string }).id },
    include: { roleProfile: true }
  });

  if (!user || user.status === "DISABLED") return null;

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
  const session = await encrypt({ 
    ...userData,
    user: userData, 
    expires 
  });
  
  (await cookies()).set("session", session, { expires, httpOnly: true });
}

export async function logout() {
  (await cookies()).set("session", "", { expires: new Date(0) });
}

interface SessionPayload extends JWTPayload {
  expires: Date;
}

export async function updateSession(request: NextRequest) {
  const session = request.cookies.get("session")?.value;
  if (!session) return;

  try {
    const parsed = await decrypt(session) as SessionPayload;
    parsed.expires = new Date(Date.now() + SESSION_DURATION * 1000);
    const res = NextResponse.next();
    res.cookies.set({
      name: "session",
      value: await encrypt(parsed),
      httpOnly: true,
      expires: parsed.expires,
    });
    return res;
  } catch {
    return;
  }
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
