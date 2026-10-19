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
    const { role, permissions, roleProfileId, isInternal, libraryIds, resetPermissionOverrides, dataHidden } = await request.json();
    const session = await getAuthorizedAdminAny("members:manage", "members:libraries");
    if (!session) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (dataHidden !== undefined && typeof dataHidden !== "boolean") return NextResponse.json({ error: "隐藏设置必须为布尔值" }, { status: 400 });
    if (dataHidden !== undefined && session.role !== "SUPER_ADMIN") return NextResponse.json({ error: "仅超级管理员可设置数据隐藏" }, { status: 403 });

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
    if (nextPermissionFlags) delete nextPermissionFlags.memberDataVisibility;
    let mergedPermissions = shouldResetPermissionOverrides
      ? clearUserPermissionOverrides(currentPermissions)
      : nextPermissionFlags !== undefined
      ? {
          ...currentPermissions,
          ...nextPermissionFlags,
        }
      : undefined;

    if (!currentUser) return NextResponse.json({ error: "成员不存在" }, { status: 404 });
    if (dataHidden !== undefined) {
      mergedPermissions = { ...(mergedPermissions ?? currentPermissions), memberDataVisibility: { hidden: dataHidden } };
    }

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

    return NextResponse.json({
      id: updatedUser.id,
      role: updatedUser.role,
      roleProfileId: updatedUser.roleProfileId,
      isInternal: updatedUser.isInternal,
    });
  } catch {
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
