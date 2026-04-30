import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedAdmin } from "@/lib/auth";

export async function PATCH(request: Request) {
  const session = await getAuthorizedAdmin("members:status");
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { email, emails, status } = await request.json();
    const targetEmails = Array.from(new Set(
      [
        ...(typeof email === "string" ? [email] : []),
        ...(Array.isArray(emails) ? emails : []),
      ]
        .map((item) => String(item || "").trim().toLowerCase())
        .filter(Boolean)
    ));

    if (targetEmails.length === 0 || !status) {
        return NextResponse.json({ error: "Email and status are required" }, { status: 400 });
    }

    const result = await prisma.user.updateMany({
        where: { email: { in: targetEmails } },
        data: { status }
    });

    return NextResponse.json({ success: true, count: result.count });
  } catch (error) {
    console.error("Failed to update status:", error);
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}
