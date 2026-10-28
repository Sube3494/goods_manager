import prisma from "@/lib/prisma";

// Reuse library authorization only. Locations never read or sync business shops
// or personal shipping addresses, including on first use.
export async function getDispatchLibraries(user: { id: string; role?: string | null }) {
  return prisma.productLibrary.findMany({
    where: user.role === "SUPER_ADMIN" ? {} : { authorizedUsers: { some: { id: user.id } } },
    select: { id: true, name: true, code: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function canAccessDispatchLibrary(user: { id: string; role?: string | null }, libraryId: string) {
  if (!libraryId) return false;
  return Boolean(await prisma.productLibrary.findFirst({
    where: { id: libraryId, ...(user.role === "SUPER_ADMIN" ? {} : { authorizedUsers: { some: { id: user.id } } }) },
    select: { id: true },
  }));
}
