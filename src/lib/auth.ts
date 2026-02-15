import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import prisma from "./prisma";

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
    where: { id: (session.user as any).id },
    include: { workspace: true }
  });

  if (!user) return null;

  return {
    ...session,
    // Flatten user fields for SessionUser compatibility
    id: user.id,
    email: user.email,
    role: user.role,
    workspaceId: user.workspaceId || "",
    permissions: user.permissions as any,
    // Keep the user object for existing frontend code that might expect it
    user: {
      ...user,
      id: user.id,
      email: user.email,
      role: user.role,
      workspaceId: user.workspaceId,
      permissions: user.permissions
    }
  };
}

export async function login(userData: any) {
  const expires = new Date(Date.now() + SESSION_DURATION * 1000);
  const session = await encrypt({ 
    ...userData,
    user: userData, // Keep nested user for backward compatibility if any
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
    // Refresh the session so it doesn't expire
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
    // If session is invalid, we can just return (let middleware handle redirect if needed)
    // or even clear the cookie.
    return;
  }
}
