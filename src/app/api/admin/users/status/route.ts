import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { SessionUser } from "@/lib/permissions";

export async function PATCH(request: Request) {
  const session = await getFreshSession() as SessionUser | null;
  // Determine if ADMIN or SUPER_ADMIN can do this. Usually SUPER_ADMIN.
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { email, status } = await request.json();

    if (!email || !status) {
        return NextResponse.json({ error: "Email and status are required" }, { status: 400 });
    }

    await prisma.user.update({
        where: { email },
        data: { status }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update status:", error);
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}
