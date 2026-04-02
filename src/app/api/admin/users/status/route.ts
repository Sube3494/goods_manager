import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedAdmin } from "@/lib/auth";

export async function PATCH(request: Request) {
  const session = await getAuthorizedAdmin("members:status");
  if (!session) {
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
