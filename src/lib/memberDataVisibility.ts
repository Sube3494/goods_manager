export function isMemberDataHidden(permissions: unknown): boolean {
  if (!permissions || typeof permissions !== "object" || Array.isArray(permissions)) return false;
  const visibility = (permissions as Record<string, unknown>).memberDataVisibility;
  return Boolean(visibility && typeof visibility === "object" && !Array.isArray(visibility)
    && (visibility as Record<string, unknown>).hidden === true);
}

export function canViewMemberData(viewer: { id: string; role?: string | null }, targetId: string, permissions: unknown): boolean {
  return viewer.id === targetId || viewer.role === "SUPER_ADMIN" || !isMemberDataHidden(permissions);
}
