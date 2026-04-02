import { hasPermission, SessionUser } from "@/lib/permissions";

export function sanitizeCallbackUrl(candidate: string | null | undefined) {
  if (!candidate) return null;
  if (!candidate.startsWith("/")) return null;
  if (candidate.startsWith("//")) return null;
  return candidate;
}

export function buildLoginRedirectUrl(callbackUrl: string) {
  const safeCallbackUrl = sanitizeCallbackUrl(callbackUrl) || "/gallery";
  return `/login?callbackUrl=${encodeURIComponent(safeCallbackUrl)}`;
}

export function getDefaultPostLoginPath(user: SessionUser | null | undefined) {
  if (!user) return "/gallery";
  return hasPermission(user, "product:read") ? "/" : "/gallery";
}

