import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, ROLE_TEMPLATES, TEMPLATE_LABELS } from "@/lib/permissions";

// 获取所有角色
export async function GET() {
  try {
    const session = await getFreshSession();
    if (!session || !hasPermission(session, "system:manage")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 自动同步内置角色模板
    for (const [key, permissions] of Object.entries(ROLE_TEMPLATES)) {
      const name = TEMPLATE_LABELS[key] || key;
      await prisma.roleProfile.upsert({
        where: { name },
        update: { permissions, isSystem: true },
        create: {
          name,
          description: `内置系统角色: ${name}`,
          permissions,
          isSystem: true
        }
      });
    }

    const roles = await prisma.roleProfile.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: {
          select: { users: true }
        }
      }
    });

    return NextResponse.json(roles);
  } catch (error) {
    console.error("Failed to fetch roles:", error);
    return NextResponse.json({ error: "Failed to fetch roles" }, { status: 500 });
  }
}

// 创建新角色
export async function POST(request: Request) {
  try {
    const session = await getFreshSession();
    if (!session || !hasPermission(session, "system:manage")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, permissions } = body;

    if (!name) {
      return NextResponse.json({ error: "Role name is required" }, { status: 400 });
    }

    const role = await prisma.roleProfile.create({
      data: {
        name,
        description,
        permissions: permissions || {},
        isSystem: false
      }
    });

    return NextResponse.json(role);
  } catch (error) {
    console.error("Failed to create role:", error);
    return NextResponse.json({ error: "Failed to create role" }, { status: 500 });
  }
}

// 更新角色
export async function PUT(request: Request) {
  try {
    const session = await getFreshSession();
    if (!session || !hasPermission(session, "system:manage")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, name, description, permissions } = body;

    if (!id) {
       return NextResponse.json({ error: "Role ID is required" }, { status: 400 });
    }

    const existing = await prisma.roleProfile.findUnique({ where: { id } });
    if (!existing) {
       return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    // 系统内置角色禁止更名，但可以修改权限（可选策略，这里允许修改描述和权限）
    const role = await prisma.roleProfile.update({
      where: { id },
      data: {
        name,
        description,
        permissions: permissions || undefined,
      }
    });

    return NextResponse.json(role);
  } catch (error) {
    console.error("Failed to update role:", error);
    return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
  }
}

// 删除角色
export async function DELETE(request: Request) {
  try {
    const session = await getFreshSession();
    if (!session || !hasPermission(session, "system:manage")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Role ID is required" }, { status: 400 });
    }

    const role = await prisma.roleProfile.findUnique({
        where: { id },
        include: { _count: { select: { users: true } } }
    });

    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }


    if (role._count.users > 0) {
      return NextResponse.json({ error: "Cannot delete role while it has active users" }, { status: 400 });
    }

    await prisma.roleProfile.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete role:", error);
    return NextResponse.json({ error: "Failed to delete role" }, { status: 500 });
  }
}
