import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getFreshSession, getSession } from "@/lib/auth";
import { getEffectivePermissions, SessionUser } from "@/lib/permissions";

export async function GET() {
  const cookieStore = await cookies();
  const rawSession = cookieStore.get("session")?.value;
  const session = await getSession();
  
  if (!session || !session.user) {
    const response = NextResponse.json({ user: null });
    if (rawSession) {
      response.cookies.set("session", "", { expires: new Date(0) });
    }
    return response;
  }

  const freshSession = await getFreshSession() as SessionUser | null;
  const freshUser = freshSession?.user as (SessionUser & {
    status?: string;
    passwordHash?: string | null;
    passwordSetAt?: string | Date | null;
  }) | undefined;

  if (!freshUser || freshUser.status === "DISABLED") {
    const response = NextResponse.json({ user: null });
    response.cookies.set("session", "", { expires: new Date(0) });
    return response;
  }
  const { passwordHash, ...safeUser } = freshUser;

  const response = NextResponse.json({
    user: {
      ...safeUser,
      hasPassword: !!passwordHash || !!freshUser.passwordSetAt,
      permissions: getEffectivePermissions(freshUser as unknown as SessionUser),
    }
  });
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  return response;
}
