import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

import { getAuthorizedAdmin } from "@/lib/auth";
import { normalizePermissionMap } from "@/lib/permissions";

/**
 * PATCH /api/admin/users/[id] - Update user permissions/role (SUPER_ADMIN only)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthorizedAdmin("members:manage");
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const { role, permissions, roleProfileId } = await request.json();

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        role: role !== undefined ? role : undefined,
        roleProfileId: roleProfileId !== undefined ? roleProfileId : undefined,
        permissions: permissions !== undefined ? normalizePermissionMap(permissions) : undefined,
      },
    });

    return NextResponse.json(updatedUser);
  } catch {
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
