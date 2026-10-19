import prisma from "@/lib/prisma";
import { canViewMemberData } from "@/lib/memberDataVisibility";

export async function mayReadMemberData(viewer: { id: string; role?: string | null }, targetId: string) {
  if (viewer.id === targetId || viewer.role === "SUPER_ADMIN") return true;
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { permissions: true } });
  return Boolean(target && canViewMemberData(viewer, targetId, target.permissions));
}
