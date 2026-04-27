import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";

import { getAuthorizedAdmin } from "@/lib/auth";
import { normalizePermissionMap } from "@/lib/permissions";

function asPrismaJsonValue<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

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
    const currentUser = await prisma.user.findUnique({
      where: { id },
      select: { permissions: true },
    });

    const currentPermissions = currentUser?.permissions
      && typeof currentUser.permissions === "object"
      && !Array.isArray(currentUser.permissions)
      ? { ...(currentUser.permissions as Record<string, unknown>) }
      : {};

    const nextPermissionFlags = permissions !== undefined ? normalizePermissionMap(permissions) : undefined;
    const mergedPermissions = nextPermissionFlags !== undefined
      ? {
          ...currentPermissions,
          ...nextPermissionFlags,
        }
      : undefined;

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        role: role !== undefined ? role : undefined,
        roleProfileId: roleProfileId !== undefined ? roleProfileId : undefined,
        permissions: mergedPermissions !== undefined ? asPrismaJsonValue(mergedPermissions) : undefined,
      },
    });

    return NextResponse.json(updatedUser);
  } catch {
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
