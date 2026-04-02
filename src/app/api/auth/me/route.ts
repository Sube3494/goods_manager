import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getEffectivePermissions, SessionUser } from "@/lib/permissions";

export async function GET() {
  const session = await getSession();
  
  if (!session || !session.user) {
    return NextResponse.json({ user: null });
  }

  // Fetch the latest user data from the database to ensure roles/permissions are up to date
  const user = await prisma.user.findUnique({
    where: { id: (session.user as SessionUser).id },
    include: { roleProfile: true }
  });

  if (!user || user.status === "DISABLED") {
    const response = NextResponse.json({ user: null });
    // 清除失效的 session cookie，防止重定向死循环
    response.cookies.set("session", "", { expires: new Date(0) });
    return response;
  }

  // Extra check: must be in whitelist if not SUPER_ADMIN
  if (user.role !== "SUPER_ADMIN") {
    const whitelisted = await prisma.emailWhitelist.findUnique({
      where: { email: user.email.toLowerCase() }
    });
    if (!whitelisted) {
        const response = NextResponse.json({ user: null });
        response.cookies.set("session", "", { expires: new Date(0) });
        return response;
    }
  }

  const response = NextResponse.json({
    user: {
      ...user,
      permissions: getEffectivePermissions(user as unknown as SessionUser),
    }
  });
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  return response;
}
