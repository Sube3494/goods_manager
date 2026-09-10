import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";

import { getAuthorizedAdminAny } from "@/lib/auth";
import { clearUserPermissionOverrides, hasAdminAccess, normalizePermissionMap } from "@/lib/permissions";

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
  try {
    const { id } = await params;
    const { role, permissions, roleProfileId, isInternal, libraryIds, resetPermissionOverrides } = await request.json();
    const session = await getAuthorizedAdminAny("members:manage", "members:libraries");
    if (!session) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updatesMemberProfile = role !== undefined || permissions !== undefined || roleProfileId !== undefined || isInternal !== undefined || resetPermissionOverrides === true;
    const updatesLibraries = libraryIds !== undefined;
    if (updatesMemberProfile && !hasAdminAccess(session, "members:manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (updatesLibraries && !hasAdminAccess(session, "members:libraries")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { id },
      select: { permissions: true },
    });

    const currentPermissions = currentUser?.permissions
      && typeof currentUser.permissions === "object"
      && !Array.isArray(currentUser.permissions)
      ? { ...(currentUser.permissions as Record<string, unknown>) }
      : {};

    const shouldResetPermissionOverrides = resetPermissionOverrides === true && roleProfileId !== undefined && permissions === undefined;
    const nextPermissionFlags = permissions !== undefined ? normalizePermissionMap(permissions) : undefined;
    const mergedPermissions = shouldResetPermissionOverrides
      ? clearUserPermissionOverrides(currentPermissions)
      : nextPermissionFlags !== undefined
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
        isInternal: isInternal !== undefined ? isInternal : undefined,
        permissions: mergedPermissions !== undefined ? asPrismaJsonValue(mergedPermissions) : undefined,
        accessibleLibraries: libraryIds !== undefined && Array.isArray(libraryIds)
          ? { set: libraryIds.map((libId: string) => ({ id: libId })) }
          : undefined,
      },
    });

    return NextResponse.json(updatedUser);
  } catch {
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
