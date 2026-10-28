import prisma from "@/lib/prisma";
export function normalizeDispatchGroupId(value: unknown): string | null {
  const id = typeof value === "string" ? value.trim() : "";
  return !id || id === "all" || id === "ungrouped" ? null : id;
}
export async function canAccessDispatchGroup(user: { id: string }, groupId: string | null) {
  if (!groupId) return true;
  return Boolean(await prisma.dispatchGroup.findFirst({ where: { id: groupId, userId: user.id }, select: { id: true } }));
}
