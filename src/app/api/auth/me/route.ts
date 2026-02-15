import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  
  if (!session || !session.user) {
    return NextResponse.json({ user: null });
  }

  // Fetch the latest user data from the database to ensure roles/permissions are up to date
  const user = await prisma.user.findUnique({
    where: { id: (session.user as any).id },
    include: { workspace: true }
  });

  if (!user) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({ user });
}
