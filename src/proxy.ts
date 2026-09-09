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

export async function proxy(request: NextRequest) {
  // Update session expiration if session exists
  const sessionResponse = await updateSession(request);
  const response = sessionResponse || NextResponse.next();

  const path = request.nextUrl.pathname;
  const isPublicApiKeyWebhook =
    ((request.method === "POST" || request.method === "DELETE") && path === "/api/v1/api-key/listened-orders") ||
    (request.method === "POST" && path.startsWith("/api/v1/api-key/listened-orders/"));

  // Define public paths that don't require authentication
  // STRICT MODE: Only Login, Gallery, and share pages are public.
  const publicPaths = ["/login", "/gallery", "/media", "/brush-plans/share", "/door-locks/scan-unlock"];

  // 1. Always allow public static files (images, favicon, etc) - handled by matcher

  // 2. Allow auth API routes
  if (path.startsWith("/api/auth")) {
    return response;
  }

  // 3. Check if path is public
  // We allow the exact paths and their sub-paths (e.g. /gallery/123)
  const isPublicPath = publicPaths.some(p => path === p || path.startsWith(p + "/"));

  // Check for public GET APIs
  const publicApis = [
    "/api/gallery",
    "/api/categories",
    "/api/products",
    "/api/system/info",
    "/api/brush-plans/public",
    "/api/uploads",
    "/api/map-distance",
  ];
  const isPublicGetApi = request.method === "GET" && publicApis.some(p => path === p || path.startsWith(p + "/"));
  const isPublicScanUnlockDetailApi = request.method === "GET" && /^\/api\/ttlock\/locks\/[^/]+\/public-detail$/.test(path);

  // Check for public POST APIs
  const publicPostApis = ["/api/upload", "/api/map-distance"];
  const isPublicPostApi = request.method === "POST" && publicPostApis.some(p => path === p || path.startsWith(p + "/"));
  const isPublicScanUnlockPostApi = request.method === "POST" && /^\/api\/ttlock\/locks\/[^/]+\/public-unlock$/.test(path);

  // Check for public PATCH APIs (Guest toggle status)
  const publicPatchApis = ["/api/brush-plans/public"];
  const isPublicPatchApi = request.method === "PATCH" && publicPatchApis.some(p => path === p || path.startsWith(p + "/"));

  // Get session from cookies
  const session = request.cookies.get("session")?.value;

  // Protect private routes
  // If pass is NOT public AND NOT a public GET API AND NOT a public POST API AND NOT a public PATCH API AND no session
  if (
    !isPublicPath
    && !isPublicGetApi
    && !isPublicScanUnlockDetailApi
    && !isPublicPostApi
    && !isPublicScanUnlockPostApi
    && !isPublicPatchApi
    && !isPublicApiKeyWebhook
    && !session
  ) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Redirect unauthenticated users hitting root to gallery
    if (path === "/") {
      return NextResponse.redirect(new URL("/gallery", request.nextUrl));
    }
    return NextResponse.redirect(new URL("/login", request.nextUrl));
  }

  // Admin pages and APIs perform fresh permission checks in their page/API
  // handlers. Proxy only verifies authentication so role changes do not require
  // users to log in again just to refresh stale JWT permissions.
  if (path.startsWith("/admin") || path.startsWith("/api/admin")) {
    return response;
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
