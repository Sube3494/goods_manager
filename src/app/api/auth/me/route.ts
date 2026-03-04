import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { SessionUser } from "@/lib/permissions";

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
    return NextResponse.json({ user: null });
  }

  // Extra check: must be in whitelist if not SUPER_ADMIN
  if (user.role !== "SUPER_ADMIN") {
    const whitelisted = await prisma.emailWhitelist.findUnique({
      where: { email: user.email.toLowerCase() }
    });
    if (!whitelisted) {
        return NextResponse.json({ user: null });
    }
  }

  const response = NextResponse.json({ user });
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  return response;
}
