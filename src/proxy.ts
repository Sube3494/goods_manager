/*
 * @Date: 2026-02-16 21:45:58
 * @Author: Sube
 * @FilePath: proxy.ts
 * @LastEditTime: 2026-03-01 01:23:46
 * @Description: 
 */

import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { updateSession } from "@/lib/auth";
import { jwtVerify } from "jose";
import { getDefaultAuthorizedPath, getEffectivePermissions, hasAdminAccess, SessionUser } from "@/lib/permissions";

function getJwtKey() {
  const secretKey = process.env.JWT_SECRET;
  if (!secretKey) {
    throw new Error("JWT_SECRET is required");
  }
  return new TextEncoder().encode(secretKey);
}

export async function proxy(request: NextRequest) {
  // Update session expiration if session exists
  const sessionResponse = await updateSession(request);
  const response = sessionResponse || NextResponse.next();

  const path = request.nextUrl.pathname;

  // Define public paths that don't require authentication
  // STRICT MODE: Only Login, Gallery, and share pages are public.
  const publicPaths = ["/login", "/gallery", "/media", "/brush-plans/share"];

  // 1. Always allow public static files (images, favicon, etc) - handled by matcher

  // 2. Allow auth API routes
  if (path.startsWith("/api/auth")) {
    return response;
  }

  // 3. Check if path is public
  // We allow the exact paths and their sub-paths (e.g. /gallery/123)
  const isPublicPath = publicPaths.some(p => path === p || path.startsWith(p + "/"));

  // Check for public GET APIs
  const publicApis = ["/api/gallery", "/api/categories", "/api/products", "/api/system/info", "/api/brush-plans/public", "/api/uploads", "/api/map-distance"];
  const isPublicGetApi = request.method === "GET" && publicApis.some(p => path === p || path.startsWith(p + "/"));

  // Check for public POST APIs
  const publicPostApis = ["/api/upload", "/api/map-distance"];
  const isPublicPostApi = request.method === "POST" && publicPostApis.some(p => path === p || path.startsWith(p + "/"));

  // Check for public PATCH APIs (Guest toggle status)
  const publicPatchApis = ["/api/brush-plans/public"];
  const isPublicPatchApi = request.method === "PATCH" && publicPatchApis.some(p => path === p || path.startsWith(p + "/"));

  // Get session from cookies
  const session = request.cookies.get("session")?.value;

  // Protect private routes
  // If pass is NOT public AND NOT a public GET API AND NOT a public POST API AND NOT a public PATCH API AND no session
  if (!isPublicPath && !isPublicGetApi && !isPublicPostApi && !isPublicPatchApi && !session) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Redirect unauthenticated users hitting root to gallery
    if (path === "/") {
      return NextResponse.redirect(new URL("/gallery", request.nextUrl));
    }
    return NextResponse.redirect(new URL("/login", request.nextUrl));
  }

  // Extra Security: Super Admin Protection for restricted paths
  if (path.startsWith("/admin") || path.startsWith("/api/admin")) {
      if (!session) {
          return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      try {
          const { payload } = await jwtVerify(session, getJwtKey());
          const sessionUser = payload as SessionUser;
          const effectivePermissions = getEffectivePermissions(sessionUser);
          const hasRolesManage = !!(
            effectivePermissions["roles:manage"] ||
            effectivePermissions["system:manage"] ||
            effectivePermissions["all"]
          );
          const isRolesPath = path === "/admin/roles" || path.startsWith("/admin/roles/") || path === "/api/admin/roles" || path.startsWith("/api/admin/roles/");
          const isMembersPath =
            path === "/admin/members" ||
            path.startsWith("/admin/members/") ||
            path === "/api/admin/whitelist" ||
            path.startsWith("/api/admin/whitelist?") ||
            path === "/api/admin/users/status" ||
            path.startsWith("/api/admin/users/status") ||
            path === "/api/admin/users" ||
            path.startsWith("/api/admin/users/");
          const hasMembersAccess =
            hasAdminAccess(sessionUser, "members:manage") ||
            hasAdminAccess(sessionUser, "members:status") ||
            hasAdminAccess(sessionUser, "whitelist:manage");

          if (!isRolesPath && !isMembersPath && payload.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Forbidden: Super Admin only" }, { status: 403 });
          }

          if (isRolesPath && payload.role !== "SUPER_ADMIN" && !hasRolesManage) {
            return NextResponse.json({ error: "Forbidden: Role managers only" }, { status: 403 });
          }

          if (isMembersPath && payload.role !== "SUPER_ADMIN" && !hasMembersAccess) {
            return NextResponse.json({ error: "Forbidden: Members managers only" }, { status: 403 });
          }

          // Optimization: Inject role/id into headers for the API to trust later
          response.headers.set("x-user-role", payload.role as string);
          response.headers.set("x-user-id", payload.id as string);
          response.headers.set("x-workspace-id", payload.workspaceId as string);

      } catch {
          return NextResponse.json({ error: "Invalid session" }, { status: 401 });
      }
  }

  // Redirect authenticated users away from login page
  if (path === "/login" && session) {
    try {
      const { payload } = await jwtVerify(session, getJwtKey());
      const sessionUser = payload as SessionUser;
      
      const target = getDefaultAuthorizedPath(sessionUser);
      return NextResponse.redirect(new URL(target, request.nextUrl));
    } catch {
      return NextResponse.redirect(new URL("/", request.nextUrl));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (auth routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images/ (public images if any)
     * - uploads/ (uploaded content)
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico|uploads|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)",
  ],
};
