import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

import { getFreshSession } from "@/lib/auth";
import { SessionUser } from "@/lib/permissions";

/**
 * PATCH /api/admin/users/[id] - Update user permissions/role (SUPER_ADMIN only)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getFreshSession() as SessionUser | null;
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const { role, permissions } = await request.json();

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        role: role !== undefined ? role : undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        permissions: permissions !== undefined ? (permissions as any) : undefined,
      },
    });

    return NextResponse.json(updatedUser);
  } catch {
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
