/*
 * @Date: 2026-02-16 21:45:58
 * @Author: Sube
 * @FilePath: proxy.ts
 * @LastEditTime: 2026-02-16 22:01:16
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

  // Define public paths that don't require authentication
  // STRICT MODE: Only Login, Gallery, and Settings are public.
  const publicPaths = ["/login", "/gallery", "/settings"];

  // 1. Always allow public static files (images, favicon, etc) - handled by matcher

  // 2. Allow auth API routes
  if (path.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // 3. Check if path is public
  // We allow the exact paths and their sub-paths (e.g. /gallery/123)
  const isPublicPath = publicPaths.some(p => path === p || path.startsWith(p + "/"));

  // Check for public GET APIs
  const publicApis = ["/api/gallery", "/api/categories", "/api/products", "/api/system/info"];
  const isPublicGetApi = request.method === "GET" && publicApis.some(p => path === p || path.startsWith(p + "/"));

  // Check for public POST APIs (Guest uploads/submissions)
  const publicPostApis = ["/api/upload", "/api/gallery/submissions"];
  const isPublicPostApi = request.method === "POST" && publicPostApis.some(p => path === p || path.startsWith(p + "/"));

  // Get session from cookies
  const session = request.cookies.get("session")?.value;

  // Protect private routes
  // If pass is NOT public AND NOT a public GET API AND NOT a public POST API AND no session
  if (!isPublicPath && !isPublicGetApi && !isPublicPostApi && !session) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Redirect unauthenticated users hitting root to gallery
    if (path === "/") {
      return NextResponse.redirect(new URL("/gallery", request.nextUrl));
    }
    return NextResponse.redirect(new URL("/login", request.nextUrl));
  }

  // Redirect authenticated users away from login page
  if (path === "/login" && session) {
    return NextResponse.redirect(new URL("/", request.nextUrl));
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
    "/((?!api/auth|_next/static|_next/image|favicon.ico|uploads|.*\\.txt$).*)",
  ],
};
